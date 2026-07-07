import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource, InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import { PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from "@solana/web3.js";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { HeliusResolver } from "../../../infra/solana/helius.resolver";
import { SolanaService } from "../../../infra/solana/solana.service";
import { RedisService } from "../../../redis/services/redis.service";
import { PaymentOrder, PaymentOrderStatus } from "../entities/payment-order.entity";
import { CreateOrderDto } from "../dtos/create-order.dto";
import { SubmitPaymentDto } from "../dtos/submit-payment.dto";
import { buildOrderMemo, memoInstruction } from "../constants/memo.constant";
import { ORDER_EXPIRY_MINUTES, ORDER_RATE_LIMIT_PER_HOUR, PACKAGES } from "../constants/packages.constant";
import { BuiltPaymentTransaction, CompleteOrderResult, CreatedPaymentOrder, PaymentOrderPage, SubmitPaymentResult } from "../types/billing.types";

@Injectable()
export class PaymentService {
    constructor(
        @InjectRepository(PaymentOrder)
        private readonly paymentOrderRepository: Repository<PaymentOrder>,
        @InjectDataSource()
        private readonly dataSource: DataSource,
        private readonly heliusResolver: HeliusResolver,
        private readonly solanaService: SolanaService,
        private readonly redisService: RedisService,
        private readonly configService: ConfigService
    ) {}

    async createOrder(userId: string, cluster: Cluster, dto: CreateOrderDto): Promise<CreatedPaymentOrder> {
        const pkg = PACKAGES[dto.packageCode];
        if (!pkg) {
            throw new BadRequestException("Invalid package code.");
        }

        await this.assertOrderRateLimitNotExceeded(userId);

        const order = await this.paymentOrderRepository.save(
            this.paymentOrderRepository.create({
                userId,
                packageCode: pkg.code,
                credits: pkg.credits,
                amountLamports: pkg.lamports.toString(),
                network: cluster,
                memo: "PAY:pending",
                expiresAt: new Date(Date.now() + ORDER_EXPIRY_MINUTES * 60 * 1000)
            })
        );
        const memo = buildOrderMemo(order.id);
        await this.paymentOrderRepository.update(order.id, { memo });

        const built = await this.buildPaymentTransaction(cluster, dto.walletAddress, pkg.lamports, memo);

        return {
            orderId: order.id,
            packageCode: pkg.code,
            credits: pkg.credits,
            amountLamports: pkg.lamports.toString(),
            expiresAt: order.expiresAt.toISOString(),
            ...built
        };
    }

    async refreshTransaction(userId: string, cluster: Cluster, orderId: string, walletAddress: string): Promise<BuiltPaymentTransaction> {
        const order = await this.getOwnedPendingOrder(userId, orderId);
        return this.buildPaymentTransaction(cluster, walletAddress, BigInt(order.amountLamports), order.memo);
    }

    async submitPayment(userId: string, cluster: Cluster, orderId: string, dto: SubmitPaymentDto): Promise<SubmitPaymentResult> {
        const order = await this.getOwnedOrder(userId, orderId);

        if (order.status === PaymentOrderStatus.COMPLETED) {
            return { success: true, creditsAdded: order.credits, alreadyProcessed: true };
        }
        if (order.status !== PaymentOrderStatus.PENDING) {
            throw new BadRequestException(`Order is ${order.status}, cannot submit payment.`);
        }

        const { signature } = await this.solanaService.submitAndConfirm(cluster, dto.signedTransaction);
        const result = await this.completeOrder(order.id, signature);

        return { success: true, creditsAdded: result.credits ?? order.credits, alreadyProcessed: result.alreadyProcessed };
    }

    // Dùng chung bởi submitPayment() (đã tự submit+confirm tx nên tin tưởng signature
    // này) VÀ cron đối soát (đã verify amount/err/memo độc lập trước khi gọi tới đây).
    // Đây là nơi DUY NHẤT ghi nhận thanh toán — điều kiện WHERE status='pending' đảm
    // bảo dù ai thắng race cũng chỉ cộng credits đúng 1 lần.
    async completeOrder(orderId: string, signature: string): Promise<CompleteOrderResult> {
        return this.dataSource.transaction(async (manager) => {
            // manager.query() trên UPDATE trả về tuple [rows, rowCount] chứ không phải rows
            // trực tiếp (khác với INSERT) — phải destructure đúng, nếu không rows[0] chính
            // là mảng rows lồng bên trong, khiến credits/userId đọc ra undefined.
            const [rows] = await manager.query<[Array<{ credits: number; userId: string }>, number]>(
                `UPDATE payment_orders SET "status" = $1, "txSignature" = $2, "completedAt" = NOW()
                 WHERE "id" = $3 AND "status" = $4
                 RETURNING "credits", "userId"`,
                [PaymentOrderStatus.COMPLETED, signature, orderId, PaymentOrderStatus.PENDING]
            );
            if (rows.length === 0) {
                return { alreadyProcessed: true };
            }

            const { credits, userId } = rows[0];
            await manager.query(
                `INSERT INTO user_credits ("userId", "balance") VALUES ($1, $2)
                 ON CONFLICT ("userId") DO UPDATE SET "balance" = user_credits."balance" + $2, "updatedAt" = NOW()`,
                [userId, credits]
            );

            return { alreadyProcessed: false, credits };
        });
    }

    async listOrders(userId: string, page = 1, limit = 20): Promise<PaymentOrderPage> {
        const [orders, total] = await this.paymentOrderRepository.findAndCount({
            where: { userId },
            order: { createdAt: "DESC" },
            take: limit,
            skip: (page - 1) * limit
        });

        return {
            orders: orders.map((order) => ({
                id: order.id,
                packageCode: order.packageCode,
                credits: order.credits,
                amountLamports: order.amountLamports,
                network: order.network,
                status: order.status,
                txSignature: order.txSignature,
                createdAt: order.createdAt.toISOString(),
                expiresAt: order.expiresAt.toISOString(),
                completedAt: order.completedAt?.toISOString() ?? null
            })),
            total,
            page,
            limit
        };
    }

    private async buildPaymentTransaction(cluster: Cluster, walletAddress: string, lamports: bigint, memo: string): Promise<BuiltPaymentTransaction> {
        const owner = this.parsePublicKey(walletAddress);
        const rpc = this.heliusResolver.forCluster(cluster);
        const latestBlockhash = await rpc.getLatestBlockhash("confirmed");

        const transferInstruction = SystemProgram.transfer({
            fromPubkey: owner,
            toPubkey: this.getMerchantWallet(),
            lamports
        });
        const message = new TransactionMessage({
            payerKey: owner,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [transferInstruction, memoInstruction(memo)]
        }).compileToV0Message();
        const tx = new VersionedTransaction(message);

        return {
            transaction: Buffer.from(tx.serialize()).toString("base64"),
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        };
    }

    private async getOwnedOrder(userId: string, orderId: string): Promise<PaymentOrder> {
        const order = await this.paymentOrderRepository.findOne({ where: { id: orderId, userId } });
        if (!order) {
            throw new NotFoundException("Order not found.");
        }
        return order;
    }

    private async getOwnedPendingOrder(userId: string, orderId: string): Promise<PaymentOrder> {
        const order = await this.getOwnedOrder(userId, orderId);
        if (order.status !== PaymentOrderStatus.PENDING) {
            throw new BadRequestException(`Order is ${order.status}, cannot refresh.`);
        }
        if (order.expiresAt.getTime() < Date.now()) {
            throw new BadRequestException("Order has expired.");
        }
        return order;
    }

    private async assertOrderRateLimitNotExceeded(userId: string): Promise<void> {
        const key = RedisService.KEYS.BILLING_ORDER_RATE_LIMIT(userId);
        const count = await this.redisService.incr(key);
        if (count === 1) {
            await this.redisService.expire(key, RedisService.TTL.BILLING_ORDER_RATE_LIMIT);
        }
        // count === null nghĩa là Redis không khả dụng — fail open, không chặn user
        // thật vì lỗi hạ tầng (khớp với cách RedisService xuống cấp mềm ở nơi khác).
        if (count !== null && count > ORDER_RATE_LIMIT_PER_HOUR) {
            throw new BadRequestException("Too many payment orders created recently. Try again later.");
        }
    }

    private getMerchantWallet(): PublicKey {
        const value = this.configService.get<string>("billing.merchantWallet");
        if (!value) {
            throw new BadRequestException("MERCHANT_WALLET is not configured.");
        }
        return this.parsePublicKey(value);
    }

    private parsePublicKey(value: string): PublicKey {
        try {
            return new PublicKey(value);
        } catch {
            throw new BadRequestException("Invalid wallet address.");
        }
    }
}

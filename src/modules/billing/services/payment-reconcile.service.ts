import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfirmedSignatureInfo, PublicKey } from "@solana/web3.js";
import { CLUSTERS, Cluster } from "../../../common/cluster/cluster.types";
import { HeliusResolver } from "../../../infra/solana/helius.resolver";
import { HeliusService } from "../../../infra/solana/helius.service";
import { RedisService } from "../../../redis/services/redis.service";
import { PaymentOrder, PaymentOrderStatus } from "../entities/payment-order.entity";
import { PaymentService } from "./payment.service";
import { extractIncomingTransfer } from "./payment-tx-parser.util";

const SCAN_LIMIT = 100;

// Lưới an toàn cho trường hợp SolanaService.submitAndConfirm đã thành công on-chain
// nhưng process crash TRƯỚC KHI PaymentService.completeOrder commit — quét ví
// merchant định kỳ, khớp theo memo "PAY:{orderId}", tự hoàn tất order nếu tìm thấy.
// completeOrder() dùng chung với submitPayment() nên dù ai thắng race cũng không
// double-credit (điều kiện WHERE status='pending' trong cùng 1 câu UPDATE).
@Injectable()
export class PaymentReconcileService {
    private readonly logger = new Logger(PaymentReconcileService.name);

    constructor(
        private readonly heliusResolver: HeliusResolver,
        private readonly redisService: RedisService,
        private readonly configService: ConfigService,
        private readonly paymentService: PaymentService,
        @InjectRepository(PaymentOrder)
        private readonly paymentOrderRepository: Repository<PaymentOrder>
    ) {}

    @Cron("*/2 * * * *")
    async reconcile(): Promise<void> {
        const merchantWallet = this.getMerchantWallet();
        if (!merchantWallet) return;

        for (const cluster of CLUSTERS) {
            await this.reconcileCluster(cluster, merchantWallet);
        }

        await this.expirePendingOrders();
    }

    private async reconcileCluster(cluster: Cluster, merchantWallet: PublicKey): Promise<void> {
        const rpc = this.heliusResolver.forCluster(cluster);
        const cursorKey = RedisService.KEYS.BILLING_RECONCILE_CURSOR(cluster);
        const cursor = await this.redisService.get<string>(cursorKey);

        let signatures: ConfirmedSignatureInfo[];
        try {
            signatures = await rpc.getSignaturesForAddress(merchantWallet, { until: cursor ?? undefined, limit: SCAN_LIMIT });
        } catch (error) {
            this.logger.error(`Failed to fetch signatures for ${cluster}: ${(error as Error).message}`);
            return;
        }

        if (signatures.length === 0) return;

        // getSignaturesForAddress trả về mới nhất trước — xử lý theo thứ tự cũ → mới.
        for (const { signature } of [...signatures].reverse()) {
            await this.reconcileSignature(cluster, signature, merchantWallet, rpc);
        }

        await this.redisService.set(cursorKey, signatures[0].signature);
    }

    private async reconcileSignature(cluster: Cluster, signature: string, merchantWallet: PublicKey, rpc: HeliusService): Promise<void> {
        const alreadyRecorded = await this.paymentOrderRepository.count({ where: { txSignature: signature } });
        if (alreadyRecorded > 0) return;

        const tx = await rpc.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
        if (!tx || tx.meta?.err) return;

        const { orderId, rawMemo, source, lamports } = extractIncomingTransfer(tx, merchantWallet);
        if (lamports === null) return; // không phải transfer tới merchantWallet, không có gì để ghi nhận

        const order = orderId ? await this.paymentOrderRepository.findOne({ where: { id: orderId, network: cluster } }) : null;
        const isValidPayment =
            !!order && (order.status === PaymentOrderStatus.PENDING || order.status === PaymentOrderStatus.EXPIRED) && lamports >= BigInt(order.amountLamports);

        if (isValidPayment && order) {
            this.logger.log(`Reconciled payment for order=${order.id} signature=${signature} cluster=${cluster}`);
            await this.paymentService.completeOrder(order.id, signature);
            return;
        }

        // Không khớp được order nào — log để tra cứu thủ công, không còn lưu bảng riêng.
        this.logger.warn(
            `Unmatched transfer signature=${signature} cluster=${cluster} from=${source ?? "unknown"} lamports=${lamports} memo=${rawMemo ?? "none"}`
        );
    }

    private async expirePendingOrders(): Promise<void> {
        await this.paymentOrderRepository.query(`UPDATE payment_orders SET "status" = $1 WHERE "status" = $2 AND "expiresAt" < NOW()`, [
            PaymentOrderStatus.EXPIRED,
            PaymentOrderStatus.PENDING
        ]);
    }

    private getMerchantWallet(): PublicKey | null {
        const value = this.configService.get<string>("billing.merchantWallet");
        if (!value) return null;
        try {
            return new PublicKey(value);
        } catch {
            this.logger.error("MERCHANT_WALLET is not a valid public key, skipping reconciliation.");
            return null;
        }
    }
}

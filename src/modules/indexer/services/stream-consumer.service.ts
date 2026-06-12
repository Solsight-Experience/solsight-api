import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PubSubService } from "../../../redis/services/pubsub.service";
import { MarketPriceEvent } from "../entities/market-price-event.entity";
import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import { Token } from "../../tokens/entities/token.entity";
import { SwapEvent, getTokenMintFromSwap } from "../../tokens/types/swap-event.type";

const TRADES_CHANNEL = "trades";
const INDEXER_NETWORK = "mainnet";

interface TransactionInsertRow {
    signature: string;
    network: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    amountOut: number;
    tokenMint: string;
    tokenMintOut: string;
    signerAddress: string;
    blockNumber: string;
    blockTime: Date;
    metadata: Transaction["metadata"];
}

type TransactionInsertParam = string | number | Date | null;

@Injectable()
export class StreamConsumerService implements OnModuleInit {
    private readonly logger = new Logger(StreamConsumerService.name);
    private latestPrices = new Map<string, number>();

    constructor(
        private readonly pubSubService: PubSubService,
        @InjectRepository(MarketPriceEvent)
        private readonly priceEventRepository: Repository<MarketPriceEvent>,
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    async onModuleInit(): Promise<void> {
        await this.pubSubService.subscribe<SwapEvent>(TRADES_CHANNEL, (swap) => {
            this.handleSwap(swap).catch((err) => this.logger.error("Error handling swap event:", err));
        });
        this.logger.log(`Subscribed to Redis channel "${TRADES_CHANNEL}" for DB persistence`);
    }

    private async handleSwap(swap: SwapEvent): Promise<void> {
        await Promise.all([this.persistPriceEvent(swap), this.persistTransaction(swap)]);

        const tokenMint = getTokenMintFromSwap(swap);
        const price = swap.price_usd ?? swap.price_native;
        if (price > 0) {
            this.latestPrices.set(tokenMint, price);
        }
    }

    private async persistPriceEvent(swap: SwapEvent): Promise<void> {
        try {
            const entity = this.priceEventRepository.create({
                tokenMint: getTokenMintFromSwap(swap),
                network: INDEXER_NETWORK,
                price: swap.price_usd ?? swap.price_native,
                slot: String(swap.slot),
                timestamp: String(swap.timestamp),
                txSignature: swap.signature,
                source: "UNKNOWN",
                eventType: "SWAP"
            });

            await this.priceEventRepository.createQueryBuilder().insert().into(MarketPriceEvent).values(entity).orIgnore().execute();
        } catch (err) {
            this.logger.error(`Failed to persist price event for sig ${swap.signature}:`, err);
        }
    }

    private async persistTransaction(swap: SwapEvent): Promise<void> {
        try {
            const entity: TransactionInsertRow = {
                signature: swap.signature,
                network: INDEXER_NETWORK,
                type: TransactionType.SWAP,
                status: TransactionStatus.CONFIRMED,
                amount: swap.token_in.amount_ui,
                amountOut: swap.token_out.amount_ui,
                tokenMint: swap.token_in.mint,
                tokenMintOut: swap.token_out.mint,
                signerAddress: swap.maker,
                blockNumber: String(swap.slot),
                blockTime: new Date(swap.timestamp * 1000),
                metadata: {
                    direction: swap.direction,
                    price_native: swap.price_native,
                    price_usd: swap.price_usd,
                    fee_amount_ui: swap.fee_amount_ui
                }
            };

            await this.insertTransactionIgnore(entity);
        } catch (err) {
            this.logger.error(`Failed to persist transaction for sig ${swap.signature}:`, err);
        }
    }

    private async insertTransactionIgnore(row: TransactionInsertRow): Promise<void> {
        const columns = [
            "signature",
            "network",
            "type",
            "status",
            "amount",
            '"amountOut"',
            '"tokenMint"',
            '"tokenMintOut"',
            '"signerAddress"',
            '"blockNumber"',
            '"blockTime"',
            "metadata"
        ];
        const params: TransactionInsertParam[] = [
            row.signature,
            row.network,
            row.type,
            row.status,
            row.amount,
            row.amountOut,
            row.tokenMint,
            row.tokenMintOut,
            row.signerAddress,
            row.blockNumber,
            row.blockTime,
            row.metadata ? JSON.stringify(row.metadata) : null
        ];
        const values = columns.map((_, index) => `$${index + 1}`).join(", ");

        await this.transactionRepository.query(
            `INSERT INTO transactions (${columns.join(", ")}) VALUES (${values}) ON CONFLICT ("signature", "network") DO NOTHING`,
            params
        );
    }

    @Cron("*/30 * * * * *")
    async flushTokenPrices(): Promise<void> {
        if (!this.latestPrices.size) return;
        const snapshot = new Map(this.latestPrices);
        this.latestPrices.clear();

        for (const [address, price] of snapshot) {
            try {
                await this.tokenRepository.update({ address, network: INDEXER_NETWORK }, { price });
            } catch (err) {
                this.logger.error(`Failed to update price for token ${address}:`, err);
            }
        }
        this.logger.debug(`Flushed prices for ${snapshot.size} tokens`);
    }
}

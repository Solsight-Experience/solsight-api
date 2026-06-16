import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PubSubService } from "../../../redis/services/pubsub.service";
import { MarketPriceEvent } from "../entities/market-price-event.entity";
import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import { Token } from "../../tokens/entities/token.entity";
import { SwapEvent, getTokenMintFromSwap } from "../../tokens/types/swap-event.types";
import { TransactionInsertParam, TransactionInsertRow } from "../types/stream-consumer.types";

const LEGACY_TRADES_CHANNEL = "trades";
const INDEXER_TRADE_CHANNELS = ["solsight:trade_events:mainnet", "solsight:trade_events:devnet"] as const;

@Injectable()
export class StreamConsumerService implements OnModuleInit {
    private readonly logger = new Logger(StreamConsumerService.name);
    private latestPrices = new Map<string, { network: string; address: string; price: number }>();

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
        for (const channel of INDEXER_TRADE_CHANNELS) {
            const network = channel.endsWith(":devnet") ? "devnet" : "mainnet";
            await this.pubSubService.subscribe<SwapEvent>(channel, (swap) => {
                this.handleSwap({ ...swap, network: swap.network || network }).catch((err) => this.logger.error("Error handling swap event:", err));
            });
            this.logger.log(`Subscribed to Redis channel "${channel}" for DB persistence`);
        }

        await this.pubSubService.subscribe<SwapEvent>(LEGACY_TRADES_CHANNEL, (swap) => {
            this.handleSwap({ ...swap, network: swap.network || "mainnet" }).catch((err) => this.logger.error("Error handling swap event:", err));
        });
        this.logger.log(`Subscribed to legacy Redis channel "${LEGACY_TRADES_CHANNEL}" for DB persistence`);
    }

    private async handleSwap(swap: SwapEvent): Promise<void> {
        await Promise.all([this.persistPriceEvent(swap), this.persistTransaction(swap)]);

        const tokenMint = getTokenMintFromSwap(swap);
        const price = swap.price_usd ?? swap.price_native;
        if (price > 0) {
            const network = this.eventNetwork(swap);
            this.latestPrices.set(`${network}:${tokenMint}`, { network, address: tokenMint, price });
        }
    }

    private async persistPriceEvent(swap: SwapEvent): Promise<void> {
        try {
            const entity = this.priceEventRepository.create({
                tokenMint: getTokenMintFromSwap(swap),
                network: this.eventNetwork(swap),
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
                network: this.eventNetwork(swap),
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

        for (const { network, address, price } of snapshot.values()) {
            try {
                await this.tokenRepository.update({ address, network }, { price });
            } catch (err) {
                this.logger.error(`Failed to update price for token ${address}:`, err);
            }
        }
        this.logger.debug(`Flushed prices for ${snapshot.size} tokens`);
    }

    private eventNetwork(swap: SwapEvent): string {
        return swap.network || "mainnet";
    }
}

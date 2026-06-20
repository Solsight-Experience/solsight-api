import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { INDEXER_TRADE_CHANNELS, LEGACY_TRADE_CHANNEL, type TradeChannels } from "../../../config/configuration";
import { PubSubService } from "../../../redis/services/pubsub.service";
import { MarketPriceEvent } from "../entities/market-price-event.entity";
import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import { Token } from "../../tokens/entities/token.entity";
import { SwapEvent, getTokenMintFromSwap } from "../../tokens/types/swap-event.types";
import { TransactionInsertParam, TransactionInsertRow } from "../types/stream-consumer.types";
import { logError } from "src/common/errors/error-helper";

@Injectable()
export class StreamConsumerService implements OnModuleInit {
    private readonly logger = new Logger(StreamConsumerService.name);
    private latestPrices = new Map<string, { network: string; address: string; price: number }>();

    constructor(
        private readonly configService: ConfigService,
        private readonly pubSubService: PubSubService,
        @InjectRepository(MarketPriceEvent)
        private readonly priceEventRepository: Repository<MarketPriceEvent>,
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    async onModuleInit(): Promise<void> {
        const configuredTradeChannel = this.configService.get<TradeChannels>("indexer.tradeChannel");
        if (configuredTradeChannel === LEGACY_TRADE_CHANNEL) {
            this.logger.warn(
                `TRADE_CHANNEL resolves to legacy "${LEGACY_TRADE_CHANNEL}"; this can double-process swaps while namespaced channels are also subscribed`
            );
        }

        for (const channel of INDEXER_TRADE_CHANNELS) {
            const network = channel.endsWith(":devnet") ? "devnet" : "mainnet";
            await this.pubSubService.subscribe<SwapEvent>(channel, (swap) => {
                this.handleSwap({ ...swap, network: swap.network || network }).catch((error) => logError(this.logger, "Error handling swap event", error));
            });
            this.logger.log(`Subscribed to Redis channel "${channel}" for DB persistence`);
        }

        await this.pubSubService.subscribe<SwapEvent>(LEGACY_TRADE_CHANNEL, (swap) => {
            this.logger.warn(`Received swap on legacy Redis channel "${LEGACY_TRADE_CHANNEL}"; keep this only during the compatibility deploy`);
            this.handleSwap({ ...swap, network: swap.network || "mainnet" }).catch((error) => logError(this.logger, "Error handling swap event", error));
        });
        this.logger.log(`Subscribed to legacy Redis channel "${LEGACY_TRADE_CHANNEL}" for DB persistence`);
    }

    private resolvePrice(swap: SwapEvent): number {
        if (swap.price_usd != null && swap.price_usd > 0) return swap.price_usd;
        const tokenMint = getTokenMintFromSwap(swap);
        const network = this.eventNetwork(swap);
        return this.latestPrices.get(`${network}:${tokenMint}`)?.price ?? swap.price_native;
    }

    private async handleSwap(swap: SwapEvent): Promise<void> {
        // Store valid USD prices before persisting so resolvePrice can use them as fallback
        const tokenMint = getTokenMintFromSwap(swap);
        if (swap.price_usd != null && swap.price_usd > 0) {
            const network = this.eventNetwork(swap);
            this.latestPrices.set(`${network}:${tokenMint}`, { network, address: tokenMint, price: swap.price_usd });
        }

        await Promise.all([this.persistPriceEvent(swap), this.persistTransaction(swap)]);
    }

    private async persistPriceEvent(swap: SwapEvent): Promise<void> {
        try {
            const entity = this.priceEventRepository.create({
                tokenMint: getTokenMintFromSwap(swap),
                network: this.eventNetwork(swap),
                price: this.resolvePrice(swap),
                slot: String(swap.slot),
                timestamp: String(swap.timestamp),
                txSignature: swap.signature,
                source: "UNKNOWN",
                eventType: "SWAP"
            });

            await this.priceEventRepository.createQueryBuilder().insert().into(MarketPriceEvent).values(entity).orIgnore().execute();
        } catch (err) {
            logError(this.logger, `Failed to persist price event for sig ${swap.signature}`, err);
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
                    price_usd: this.resolvePrice(swap),
                    fee_amount_ui: swap.fee_amount_ui
                }
            };

            await this.insertTransactionIgnore(entity);
        } catch (err) {
            logError(this.logger, `Failed to persist transaction for sig ${swap.signature}`, err);
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
                logError(this.logger, `Failed to update price for token ${address}`, err);
            }
        }
        this.logger.debug(`Flushed prices for ${snapshot.size} tokens`);
    }

    private eventNetwork(swap: SwapEvent): string {
        return swap.network || "mainnet";
    }
}

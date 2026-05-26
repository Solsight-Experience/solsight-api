import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Repository } from "typeorm";
import { PubSubService } from "../../../redis/services/pubsub.service";
import { MarketPriceEvent } from "../entities/market-price-event.entity";
import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import { Token } from "../../tokens/entities/token.entity";
import { SwapEvent, getTokenMintFromSwap } from "../../tokens/types/swap-event.type";
import { DataSourceRegistry } from "../../../common/cluster/data-source-registry";
import { ClusterProvider } from "../../../common/cluster/cluster.provider";

const TRADES_CHANNEL = "trades";

@Injectable()
export class StreamConsumerService implements OnModuleInit {
    private readonly logger = new Logger(StreamConsumerService.name);
    private latestPrices = new Map<string, number>();

    constructor(
        private readonly pubSubService: PubSubService,
        private readonly registryService: DataSourceRegistry,
        private readonly clusterProvider: ClusterProvider
    ) {}

    private async getPriceEventRepository(): Promise<Repository<MarketPriceEvent>> {
        const dataSource = this.registryService.get("mainnet");
        return dataSource.getRepository(MarketPriceEvent);
    }

    private async getTransactionRepository(): Promise<Repository<Transaction>> {
        const dataSource = this.registryService.get("mainnet");
        return dataSource.getRepository(Transaction);
    }

    private async getTokenRepository(): Promise<Repository<Token>> {
        const dataSource = this.registryService.get("mainnet");
        return dataSource.getRepository(Token);
    }

    async onModuleInit(): Promise<void> {
        await this.pubSubService.subscribe(TRADES_CHANNEL, (message) => {
            const swap = message as SwapEvent;
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
            const entity = await (
                await this.getPriceEventRepository()
            ).create({
                tokenMint: getTokenMintFromSwap(swap),
                price: swap.price_usd ?? swap.price_native,
                slot: String(swap.slot),
                timestamp: String(swap.timestamp),
                txSignature: swap.signature,
                source: "UNKNOWN",
                eventType: "SWAP"
            });

            await await (await this.getPriceEventRepository()).createQueryBuilder().insert().into(MarketPriceEvent).values(entity).orIgnore().execute();
        } catch (err) {
            this.logger.error(`Failed to persist price event for sig ${swap.signature}:`, err);
        }
    }

    private async persistTransaction(swap: SwapEvent): Promise<void> {
        try {
            const entity = await (
                await this.getTransactionRepository()
            ).create({
                signature: swap.signature,
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
            });

            await await (await this.getTransactionRepository()).createQueryBuilder().insert().into(Transaction).values(entity).orIgnore().execute();
        } catch (err) {
            this.logger.error(`Failed to persist transaction for sig ${swap.signature}:`, err);
        }
    }

    @Cron("*/30 * * * * *")
    async flushTokenPrices(): Promise<void> {
        if (!this.latestPrices.size) return;
        const snapshot = new Map(this.latestPrices);
        this.latestPrices.clear();

        for (const [address, price] of snapshot) {
            try {
                await await (await this.getTokenRepository()).update({ address }, { price });
            } catch (err) {
                this.logger.error(`Failed to update price for token ${address}:`, err);
            }
        }
        this.logger.debug(`Flushed prices for ${snapshot.size} tokens`);
    }
}

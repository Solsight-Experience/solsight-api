import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { MarketPriceEvent } from "../entities/market-price-event.entity";
import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import { SwapEvent, getTokenMintFromSwap } from "../../tokens/types/swap-event.types";
import { TransactionInsertParam, TransactionInsertRow } from "../types/stream-consumer.types";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { CLUSTERS } from "../../../common/cluster/cluster.types";
import { REDIS_CHANNELS, clusterFromChannel } from "../../../redis/channels";
import type { EventHandler } from "../../../redis/event-handler";
import type { RedisChannel } from "../../../redis/utils/redisChannels";
import { logError } from "src/common/errors/error-helper";
import { TokenPriceService } from "../../tokens/services/token-price.service";

@Injectable()
export class StreamConsumerService implements EventHandler<SwapEvent> {
    private readonly logger = new Logger(StreamConsumerService.name);

    constructor(
        @InjectRepository(MarketPriceEvent)
        private readonly priceEventRepository: Repository<MarketPriceEvent>,
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        private readonly tokenPriceService: TokenPriceService
    ) {}

    channels(): RedisChannel<SwapEvent>[] {
        return CLUSTERS.map((cluster) => REDIS_CHANNELS.TRADE_EVENTS(cluster));
    }

    async handle(swap: SwapEvent, channel: RedisChannel<SwapEvent>): Promise<void> {
        const normalizedSwap = swap.network ? swap : { ...swap, network: clusterFromChannel(channel) };
        await this.handleSwap(normalizedSwap);
    }

    private async resolvePriceUsd(swap: SwapEvent): Promise<number> {
        if (swap.price_usd != null && swap.price_usd > 0) return swap.price_usd;
        const tokenMint = getTokenMintFromSwap(swap);
        const price = await this.tokenPriceService.getPrice(this.eventNetwork(swap), tokenMint);
        return price.priceUsd;
    }

    private async handleSwap(swap: SwapEvent): Promise<void> {
        const tokenMint = getTokenMintFromSwap(swap);
        const network = this.eventNetwork(swap);

        if (swap.price_usd != null && swap.price_usd > 0) {
            await this.tokenPriceService.setPrice({
                cluster: network,
                mint: tokenMint,
                priceUsd: swap.price_usd,
                priceNative: swap.price_native,
                slot: swap.slot,
                source: "indexer-stream-consumer"
            });
        }

        const resolvedPriceUsd = await this.resolvePriceUsd(swap);

        await Promise.all([this.persistPriceEvent(swap, resolvedPriceUsd), this.persistTransaction(swap, resolvedPriceUsd)]);
    }

    private async persistPriceEvent(swap: SwapEvent, resolvedPriceUsd: number): Promise<void> {
        try {
            const entity = this.priceEventRepository.create({
                tokenMint: getTokenMintFromSwap(swap),
                network: this.eventNetwork(swap),
                price: resolvedPriceUsd,
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

    private async persistTransaction(swap: SwapEvent, resolvedPriceUsd: number): Promise<void> {
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
                    price_usd: resolvedPriceUsd,
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
    private eventNetwork(swap: SwapEvent): Cluster {
        return swap.network;
    }
}

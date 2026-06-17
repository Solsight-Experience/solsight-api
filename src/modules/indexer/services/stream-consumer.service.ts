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

@Injectable()
export class StreamConsumerService implements OnModuleInit {
    private readonly logger = new Logger(StreamConsumerService.name);
    private latestPricesByToken = new Map<string, number>();

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
        await this.pubSubService.subscribe(TRADES_CHANNEL, (message) => {
            const swap = message as SwapEvent;
            this.handleSwap(swap).catch((err) => this.logger.error("Error handling swap event:", err));
        });
        this.logger.log(`Subscribed to Redis channel "${TRADES_CHANNEL}" for DB persistence`);
    }

    private resolvePrice(swap: SwapEvent): number {
        if (swap.price_usd != null && swap.price_usd > 0) return swap.price_usd;
        const tokenMint = getTokenMintFromSwap(swap);
        return this.latestPricesByToken.get(tokenMint) ?? swap.price_native;
    }

    private async handleSwap(swap: SwapEvent): Promise<void> {
        // Store valid USD prices before persisting so resolvePrice can use them as fallback
        const tokenMint = getTokenMintFromSwap(swap);
        if (swap.price_usd != null && swap.price_usd > 0) {
            this.latestPricesByToken.set(tokenMint, swap.price_usd);
        }

        await Promise.all([this.persistPriceEvent(swap), this.persistTransaction(swap)]);
    }

    private async persistPriceEvent(swap: SwapEvent): Promise<void> {
        try {
            const entity = this.priceEventRepository.create({
                tokenMint: getTokenMintFromSwap(swap),
                network: INDEXER_NETWORK,
                price: this.resolvePrice(swap),
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
            const entity = this.transactionRepository.create({
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
                    price_usd: this.resolvePrice(swap),
                    fee_amount_ui: swap.fee_amount_ui
                },
                fee: swap.fee_amount_ui ?? undefined
            });

            await this.transactionRepository.createQueryBuilder().insert().into(Transaction).values(entity).orIgnore().execute();
        } catch (err) {
            this.logger.error(`Failed to persist transaction for sig ${swap.signature}:`, err);
        }
    }

    @Cron("*/30 * * * * *")
    async flushTokenPrices(): Promise<void> {
        if (!this.latestPricesByToken.size) return;
        const snapshot = new Map(this.latestPricesByToken);
        this.latestPricesByToken.clear();

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

import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RedisService } from "../../../../redis/services/redis.service";
import { Token } from "../../entities/token.entity";
import { SwapEvent, TokenStats, SwapPriceResult } from "../../types/swap-event.type";

@Injectable()
export class StatsAggregationService {
    private readonly logger = new Logger(StatsAggregationService.name);

    constructor(
        private readonly redisService: RedisService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    async onSwapEvent(swap: SwapEvent, prices: SwapPriceResult): Promise<void> {
        const tokenOutMint = swap.token_out.mint;
        const tokenInMint = swap.token_in.mint;

        this.logger.log(`[SET] out="${tokenOutMint}" price=${prices.priceUsdTokenOut} | in="${tokenInMint}" price=${prices.priceUsdTokenIn}`);

        // Store price for both tokens
        await this.storePriceData(tokenOutMint, prices.priceUsdTokenOut);
        await this.storePriceData(tokenInMint, prices.priceUsdTokenIn);

        // Store volume and txns for both tokens
        // token_out = user is BUYING this token
        // token_in = user is SELLING this token
        await this.storeVolumeAndTxns(tokenOutMint, prices.volumeUsdTokenOut, "buy");
        await this.storeVolumeAndTxns(tokenInMint, prices.volumeUsdTokenIn, "sell");
    }

    private async storePriceData(tokenMint: string, priceUsd: number): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            // Store latest price
            await this.redisService.set(`price:${tokenMint}:latest`, {
                usd: priceUsd
            });

            // Store price in history for 24h change calculation
            const now = Date.now();
            const historyKey = `price:${tokenMint}:history`;

            // Add to sorted set with timestamp as score
            await redis.zadd(historyKey, now, `${priceUsd}:${now}`);

            // Remove entries older than 24h
            const cutoff = now - 24 * 60 * 60 * 1000;
            await redis.zremrangebyscore(historyKey, "-inf", cutoff);

            // Set TTL on history key (25 hours to be safe)
            await redis.expire(historyKey, 25 * 60 * 60);
        } catch (error) {
            this.logger.error(`Redis error in storePriceData for "${tokenMint}":`, error);
        }
    }

    private async storeVolumeAndTxns(tokenMint: string, volumeUsd: number, txType: "buy" | "sell"): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            const now = Date.now();
            const cutoff = now - 24 * 60 * 60 * 1000;

            // Store volume in sorted set (rolling 24h window)
            const volumeKey = `volume:${tokenMint}:24h`;
            await redis.zadd(volumeKey, now, `${volumeUsd}:${now}`);
            await redis.zremrangebyscore(volumeKey, "-inf", cutoff);
            await redis.expire(volumeKey, 25 * 60 * 60);

            // Store transaction in sorted set (rolling 24h window)
            const txnsKey = `txns:${tokenMint}:24h`;
            await redis.zadd(txnsKey, now, `${txType}:${now}`);
            await redis.zremrangebyscore(txnsKey, "-inf", cutoff);
            await redis.expire(txnsKey, 25 * 60 * 60);
        } catch (error) {
            this.logger.error(`Redis error in storeVolumeAndTxns for "${tokenMint}":`, error);
        }
    }

    async getStats(tokenMint: string): Promise<TokenStats> {
        // Get latest price from Redis (object with native and usd)
        const latestPriceData = await this.redisService.get<{
            native: number;
            usd: number;
        }>(`price:${tokenMint}:latest`);

        // Get token from database for other stats
        const token = await this.tokenRepository.findOneBy({ address: tokenMint });

        // Calculate 24h price change (use USD price)
        const priceUsd = latestPriceData?.usd ?? null;
        const priceChange24h = await this.calculatePriceChange24h(tokenMint, priceUsd);

        // Get volume and txns from Redis (real-time from swap events)
        const volume24h = await this.getVolume24h(tokenMint);
        const txns24h = await this.getTxns24h(tokenMint);

        const price = priceUsd ?? token?.price ?? 0;
        const totalSupply = await this.getTotalSupply(tokenMint);
        this.logger.log(`[GET] token="${tokenMint}" price=${price} (${latestPriceData ? "Redis" : "DB"})`);

        return {
            timestamp: Date.now() / 1000,
            price: Number(price),
            price_change: {
                "24h": priceChange24h ?? Number(token?.priceChange24h ?? 0)
            },
            market_cap: Number(price) * totalSupply,
            market_cap_change_24h: Number(token?.marketCapChange24h ?? 0),
            liquidity: Number(token?.liquidity ?? 0),
            liquidity_change_24h: Number(token?.liquidityChange24h ?? 0),
            holders: {
                count: Number(token?.holdersCount ?? 0),
                change_24h: Number(token?.holdersChange24h ?? 0)
            },
            volume: {
                "24h": volume24h || Number(token?.volume24h ?? 0)
            },
            volume_change_24h: Number(token?.volumeChange24h ?? 0),
            txns: {
                "24h": {
                    total: txns24h.total || Number(token?.txns24hTotal ?? 0),
                    buys: txns24h.buys || Number(token?.txns24hBuys ?? 0),
                    sells: txns24h.sells || Number(token?.txns24hSells ?? 0)
                }
            },
            txns_change_24h: Number(token?.txns24hChange ?? 0)
        };
    }

    async getTotalSupply(tokenMint: string): Promise<number> {
        const cacheKey = `supply:${tokenMint}`;
        const cached = await this.redisService.get<number>(cacheKey);
        if (cached != null) return cached;

        const token = await this.tokenRepository.findOneBy({ address: tokenMint });
        const totalSupply = Number(token?.totalSupply ?? 0);
        await this.redisService.set(cacheKey, totalSupply, 60);
        return totalSupply;
    }

    async getLatestPrice(tokenMint: string): Promise<{ native: number; usd: number } | null> {
        return this.redisService.get<{ native: number; usd: number }>(`price:${tokenMint}:latest`);
    }

    private async getVolume24h(tokenMint: string): Promise<number> {
        const redis = this.redisService.getClient();
        if (!redis) return 0;

        try {
            const volumeKey = `volume:${tokenMint}:24h`;
            const entries = await redis.zrange(volumeKey, 0, -1);
            if (!entries || entries.length === 0) return 0;

            let totalVolume = 0;
            for (const entry of entries) {
                const [volumeStr] = entry.split(":");
                totalVolume += parseFloat(volumeStr) || 0;
            }
            return totalVolume;
        } catch (error) {
            this.logger.error(`Redis error in getVolume24h for "${tokenMint}":`, error);
            return 0;
        }
    }

    private async getTxns24h(tokenMint: string): Promise<{ total: number; buys: number; sells: number }> {
        const redis = this.redisService.getClient();
        if (!redis) return { total: 0, buys: 0, sells: 0 };

        try {
            const txnsKey = `txns:${tokenMint}:24h`;
            const entries = await redis.zrange(txnsKey, 0, -1);
            if (!entries || entries.length === 0) {
                return { total: 0, buys: 0, sells: 0 };
            }

            let buys = 0;
            let sells = 0;
            for (const entry of entries) {
                const [txType] = entry.split(":");
                if (txType === "buy") buys++;
                else if (txType === "sell") sells++;
            }
            return { total: buys + sells, buys, sells };
        } catch (error) {
            this.logger.error(`Redis error in getTxns24h for "${tokenMint}":`, error);
            return { total: 0, buys: 0, sells: 0 };
        }
    }

    private async calculatePriceChange24h(tokenMint: string, currentPrice: number | null): Promise<number | null> {
        if (!currentPrice) return null;

        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const historyKey = `price:${tokenMint}:history`;
            const oldest = await redis.zrange(historyKey, 0, 0);
            if (!oldest || oldest.length === 0) return null;

            const [oldPriceStr] = oldest[0].split(":");
            const oldPrice = parseFloat(oldPriceStr);

            if (oldPrice === 0) return null;
            return ((currentPrice - oldPrice) / oldPrice) * 100;
        } catch (error) {
            this.logger.error(`Redis error in calculatePriceChange24h for "${tokenMint}":`, error);
            return null;
        }
    }
}

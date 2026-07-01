import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RedisService } from "../../../../redis/services/redis.service";
import { Token } from "../../entities/token.entity";
import type { Cluster } from "../../../../common/cluster/cluster.types";
import { SwapEvent, TokenStats, SwapPriceResult, TradeData, isValidPrice } from "../../types/swap-event.types";
import { logError } from "src/common/errors/error-helper";
import { TokenPriceService } from "../token-price.service";

const TRADES_MAX_SIZE = 500;

@Injectable()
export class StatsAggregationService {
    private readonly logger = new Logger(StatsAggregationService.name);

    constructor(
        private readonly redisService: RedisService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly tokenPriceService: TokenPriceService
    ) {}

    async onSwapEvent(swap: SwapEvent, prices: SwapPriceResult): Promise<void> {
        const tokenOutMint = swap.token_out.mint;
        const tokenInMint = swap.token_in.mint;
        const network = this.eventNetwork(swap);

        this.logger.log(`[SET] out="${tokenOutMint}" price=${prices.priceUsdTokenOut} | in="${tokenInMint}" price=${prices.priceUsdTokenIn}`);

        // Track both mints as active for the stats-persist cron
        void this.redisService.sadd(RedisService.KEYS.ACTIVE_TOKENS(network), tokenOutMint, tokenInMint).catch(() => {});

        // Store price for both tokens
        await this.storePriceData(tokenOutMint, network, prices.priceUsdTokenOut, swap.price_native, swap);
        await this.storePriceData(tokenInMint, network, prices.priceUsdTokenIn, swap.price_native, swap);

        // Store volume and txns for both tokens
        // token_out = user is BUYING this token
        // token_in = user is SELLING this token
        await this.storeVolumeAndTxns(tokenOutMint, network, prices.volumeUsdTokenOut, "buy", prices.priceUsdTokenOut);
        await this.storeVolumeAndTxns(tokenInMint, network, prices.volumeUsdTokenIn, "sell", prices.priceUsdTokenIn);
    }

    private async storePriceData(tokenMint: string, network: Cluster, priceUsd: number, priceNative: number, swap: SwapEvent): Promise<void> {
        if (!isValidPrice(priceUsd)) return;

        await this.tokenPriceService.setPrice({
            cluster: network,
            mint: tokenMint,
            priceUsd,
            priceNative,
            slot: swap.slot,
            source: "swap"
        });

        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            // Store price in history for 24h change calculation
            const now = Date.now();
            const historyKey = RedisService.KEYS.TOKEN_PRICE_HISTORY(network, tokenMint);

            // Add to sorted set with timestamp as score
            await redis.zadd(historyKey, now, `${priceUsd}:${now}`);

            // Remove entries older than 24h
            const cutoff = now - 24 * 60 * 60 * 1000;
            await redis.zremrangebyscore(historyKey, "-inf", cutoff);

            // Set TTL on history key (25 hours to be safe)
            await redis.expire(historyKey, RedisService.TTL.TOKEN_PRICE_HISTORY);
        } catch (error) {
            logError(this.logger, `Redis error in storePriceData for "${tokenMint}"`, error);
        }
    }

    private async storeVolumeAndTxns(tokenMint: string, network: Cluster, volumeUsd: number, txType: "buy" | "sell", priceUsd: number): Promise<void> {
        if (!isValidPrice(priceUsd)) return;

        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            const now = Date.now();
            const cutoff = now - 24 * 60 * 60 * 1000;

            // Store volume in sorted set (rolling 24h window)
            const volumeKey = RedisService.KEYS.VOLUME_24H(network, tokenMint);
            await redis.zadd(volumeKey, now, `${volumeUsd}:${priceUsd}:${now}`);
            await redis.zremrangebyscore(volumeKey, "-inf", cutoff);
            await redis.expire(volumeKey, RedisService.TTL.VOLUME_24H);

            // Store transaction in sorted set (rolling 24h window)
            const txnsKey = RedisService.KEYS.TXNS_24H(network, tokenMint);
            await redis.zadd(txnsKey, now, `${txType}:${priceUsd}:${now}`);
            await redis.zremrangebyscore(txnsKey, "-inf", cutoff);
            await redis.expire(txnsKey, RedisService.TTL.TXNS_24H);
        } catch (error) {
            logError(this.logger, `Redis error in storeVolumeAndTxns for "${tokenMint}"`, error);
        }
    }

    async getStats(cluster: Cluster, tokenMint: string): Promise<TokenStats> {
        // Get latest price from Redis (object with native and usd)
        const latestPriceData = await this.tokenPriceService.getPrice(cluster, tokenMint);

        // Get token from database for other stats
        const token = await this.tokenRepository.findOneBy({ address: tokenMint, network: cluster });

        // Calculate 24h price change (use USD price)
        const priceUsd = latestPriceData?.priceUsd;
        const priceChange24h = await this.calculatePriceChange24h(cluster, tokenMint, priceUsd);

        // Get volume and txns from Redis (real-time from swap events)
        const volume24h = await this.getVolume24h(cluster, tokenMint);
        const txns24h = await this.getTxns24h(cluster, tokenMint);

        const price = priceUsd ?? token?.price ?? 0;
        const totalSupply = await this.getTotalSupply(cluster, tokenMint);
        this.logger.log(`[GET] token="${tokenMint}" price=${price} (${latestPriceData ? "Redis" : "DB"})`);

        return {
            timestamp: Date.now() / 1000,
            price: String(price),
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

    async getTotalSupply(cluster: Cluster, tokenMint: string): Promise<number> {
        const cacheKey = RedisService.KEYS.SUPPLY(cluster, tokenMint);
        const cached = await this.redisService.get<number>(cacheKey);
        if (cached != null) return cached;

        const token = await this.tokenRepository.findOneBy({ address: tokenMint, network: cluster });
        const totalSupply = Number(token?.totalSupply ?? 0);
        await this.redisService.set(cacheKey, totalSupply, RedisService.TTL.SUPPLY);
        return totalSupply;
    }

    private async getVolume24h(cluster: Cluster, tokenMint: string): Promise<number> {
        const redis = this.redisService.getClient();
        if (!redis) return 0;

        try {
            const volumeKey = RedisService.KEYS.VOLUME_24H(cluster, tokenMint);
            const entries = await redis.zrange(volumeKey, 0, -1);
            if (!entries || entries.length === 0) return 0;

            let totalVolume = 0;
            for (const entry of entries) {
                const [volumeStr, priceStr] = entry.split(":");
                const price = parseFloat(priceStr);
                if (!isValidPrice(price)) continue;
                totalVolume += parseFloat(volumeStr) || 0;
            }
            return totalVolume;
        } catch (error) {
            logError(this.logger, `Redis error in getVolume24h for "${tokenMint}"`, error);
            return 0;
        }
    }

    private async getTxns24h(cluster: Cluster, tokenMint: string): Promise<{ total: number; buys: number; sells: number }> {
        const redis = this.redisService.getClient();
        if (!redis) return { total: 0, buys: 0, sells: 0 };

        try {
            const txnsKey = RedisService.KEYS.TXNS_24H(cluster, tokenMint);
            const entries = await redis.zrange(txnsKey, 0, -1);
            if (!entries || entries.length === 0) {
                return { total: 0, buys: 0, sells: 0 };
            }

            let buys = 0;
            let sells = 0;
            for (const entry of entries) {
                const [txType, priceStr] = entry.split(":");
                const price = parseFloat(priceStr);
                if (!isValidPrice(price)) continue;
                if (txType === "buy") buys++;
                else if (txType === "sell") sells++;
            }
            return { total: buys + sells, buys, sells };
        } catch (error) {
            logError(this.logger, `Redis error in getTxns24h for "${tokenMint}"`, error);
            return { total: 0, buys: 0, sells: 0 };
        }
    }

    async storeTradeData(cluster: Cluster, tokenMint: string, tradeData: TradeData): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            const tradesKey = RedisService.KEYS.TRADES_24H(cluster, tokenMint);
            await redis.zadd(tradesKey, tradeData.timestamp, JSON.stringify(tradeData));
            await redis.zremrangebyrank(tradesKey, 0, -(TRADES_MAX_SIZE + 1));
            await redis.expire(tradesKey, RedisService.TTL.TRADES_24H);
        } catch (error) {
            logError(this.logger, `Redis error in storeTradeData for "${tokenMint}"`, error);
        }
    }

    async getTrades(cluster: Cluster, tokenMint: string, limit = 50): Promise<{ trades: TradeData[]; total: number }> {
        const redis = this.redisService.getClient();
        if (!redis) return { trades: [], total: 0 };

        try {
            const tradesKey = RedisService.KEYS.TRADES_24H(cluster, tokenMint);
            const [entries, total] = await Promise.all([redis.zrevrange(tradesKey, 0, limit - 1), redis.zcard(tradesKey)]);

            if (!entries || entries.length === 0) return { trades: [], total: 0 };

            const seen = new Set<string>();
            const trades: TradeData[] = [];
            for (const entry of entries) {
                const trade = JSON.parse(entry) as TradeData;
                if (!seen.has(trade.tx_hash)) {
                    seen.add(trade.tx_hash);
                    trades.push(trade);
                }
            }

            return { trades, total };
        } catch (error) {
            logError(this.logger, `Redis error in getTrades for "${tokenMint}"`, error);
            return { trades: [], total: 0 };
        }
    }

    private async calculatePriceChange24h(cluster: Cluster, tokenMint: string, currentPrice: number | null): Promise<number | null> {
        if (!currentPrice) return null;

        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const historyKey = RedisService.KEYS.TOKEN_PRICE_HISTORY(cluster, tokenMint);
            const oldest = await redis.zrange(historyKey, 0, 0);
            if (!oldest || oldest.length === 0) return null;

            const [oldPriceStr] = oldest[0].split(":");
            const oldPrice = parseFloat(oldPriceStr);

            if (oldPrice === 0) return null;
            return ((currentPrice - oldPrice) / oldPrice) * 100;
        } catch (error) {
            logError(this.logger, `Redis error in calculatePriceChange24h for "${tokenMint}"`, error);
            return null;
        }
    }

    private eventNetwork(swap: SwapEvent): Cluster {
        return swap.network;
    }
}

import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Token } from "../entities/token.entity";
import { In, Repository } from "typeorm";
import { CoinGeckoService } from "src/infra/coingecko/coingecko.service";
import type { Cluster } from "src/common/cluster/cluster.types";
import { RedisService } from "src/redis";
import type { TokenPriceResult, TokenPriceSetInput } from "../types/token-price.types";
import { getErrorMessage, logError } from "src/common/errors/error-helper";

/**
 * Owns the live latest-price cache in Redis.
 *
 * Redis `TOKEN_PRICE_LATEST` is the slot-ordered, short-latency USD price source for
 * request-time reads and trade ingestion. `tokens.price` is the durable fallback
 * projected asynchronously from market-price events (and mainnet catalog sync), never
 * a synchronous swap write target. ESLint blocks `RedisService.KEYS.TOKEN_PRICE_LATEST`
 * references outside this service and the Redis key registry.
 */
@Injectable()
export class TokenPriceService {
    private readonly logger = new Logger(TokenPriceService.name);
    private static readonly STALE_THRESHOLD_S = 5 * 60;
    static readonly PRICE_TTL_S = RedisService.TTL.TOKEN_PRICE_LATEST;
    static readonly FRESH_MIN_TTL_S = TokenPriceService.PRICE_TTL_S - TokenPriceService.STALE_THRESHOLD_S;
    private static readonly UPSERT_LATEST_PRICE_SCRIPT = `
        local key = KEYS[1]
        local incomingSlot = tonumber(ARGV[1])
        local ttl = tonumber(ARGV[2])
        local priceUsd = ARGV[3]
        local priceNative = ARGV[4]
        local source = ARGV[5]

        local keyType = redis.call('TYPE', key)['ok']
        if keyType ~= 'none' and keyType ~= 'hash' then
            redis.call('DEL', key)
        end

        local currentSlotRaw = redis.call('HGET', key, 'slot')
        if currentSlotRaw then
            local currentSlot = tonumber(currentSlotRaw)
            if currentSlot and incomingSlot < currentSlot then
                return 0
            end
        end

        redis.call('HSET', key, 'price_usd', priceUsd, 'price_native', priceNative, 'slot', tostring(incomingSlot), 'source', source)
        redis.call('EXPIRE', key, ttl)

        return 1
    `;
    private static readonly REHYDRATE_LATEST_PRICE_SCRIPT = `
        local key = KEYS[1]
        local freshMinTtl = tonumber(ARGV[1])
        local ttl = tonumber(ARGV[2])
        local priceUsd = ARGV[3]

        local keyType = redis.call('TYPE', key)['ok']
        if keyType ~= 'none' and keyType ~= 'hash' then
            redis.call('DEL', key)
            keyType = 'none'
        end

        if keyType == 'hash' and redis.call('TTL', key) >= freshMinTtl then
            return 0
        end

        local priceNative = redis.call('HGET', key, 'price_native') or '0'
        local slot = redis.call('HGET', key, 'slot') or '0'

        redis.call('HSET', key, 'price_usd', priceUsd, 'price_native', priceNative, 'slot', slot, 'source', 'reference-sync')
        redis.call('EXPIRE', key, ttl)

        return 1
    `;

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly redisService: RedisService,
        private readonly coinGeckoService: CoinGeckoService
    ) {}

    // Keep the write API singular until a real production bulk writer exists.
    async setPrice({ cluster, mint, ...price }: TokenPriceSetInput): Promise<boolean> {
        if (!this.isValidWritePrice(price.priceUsd) || !this.isValidWritePrice(price.priceNative)) {
            this.logger.debug(`Rejected invalid latest price for ${cluster}:${mint}`);
            return false;
        }

        const redis = this.redisService.getClient();
        if (!redis) return false;

        const key = RedisService.KEYS.TOKEN_PRICE_LATEST(cluster, mint);

        try {
            const stored = await redis.eval(
                TokenPriceService.UPSERT_LATEST_PRICE_SCRIPT,
                1,
                key,
                String(price.slot),
                String(TokenPriceService.PRICE_TTL_S),
                String(price.priceUsd),
                String(price.priceNative),
                price.source
            );

            if (stored === 1 || stored === "1") {
                return true;
            }

            this.logger.debug(`Dropped stale latest price for ${cluster}:${mint} at slot ${price.slot}`);
            return false;
        } catch (error) {
            logError(this.logger, `Failed to write Redis price for ${cluster}:${mint}`, error);
            return false;
        }
    }

    async getPrice(cluster: Cluster, mint: string): Promise<TokenPriceResult> {
        const redisPrice = await this.getFreshRedisPrice(cluster, mint);
        if (redisPrice != null) {
            return { priceUsd: redisPrice, priceChange24h: 0, source: "redis" };
        }

        const token = await this.tokenRepository.findOne({
            where: { address: mint, network: cluster },
            select: ["price", "priceChange24h", "coingeckoId"]
        });

        const dbPrice = Number(token?.price) || 0;
        if (this.isValidWritePrice(dbPrice)) {
            await this.rehydrateRedisPrice(cluster, mint, dbPrice);
            return { priceUsd: dbPrice, priceChange24h: Number(token?.priceChange24h) || 0, source: "db" };
        }

        return { priceUsd: 0, priceChange24h: 0, source: "db" };
    }

    async getPrices(cluster: Cluster, mints: string[]): Promise<Map<string, TokenPriceResult>> {
        const result = new Map<string, TokenPriceResult>();
        if (mints.length === 0) return result;

        const needFallback: string[] = [];

        await Promise.all(
            mints.map(async (mint) => {
                const redisPrice = await this.getFreshRedisPrice(cluster, mint);
                if (redisPrice != null) {
                    result.set(mint, { priceUsd: redisPrice, priceChange24h: 0, source: "redis" });
                    return;
                }
                needFallback.push(mint);
            })
        );

        if (needFallback.length > 0) {
            const tokens = await this.tokenRepository.find({
                where: { address: In(needFallback), network: cluster },
                select: ["address", "price", "priceChange24h"]
            });

            const rehydrateTasks: Promise<void>[] = [];
            for (const t of tokens) {
                const priceUsd = Number(t.price) || 0;
                if (this.isValidWritePrice(priceUsd)) {
                    result.set(t.address, { priceUsd, priceChange24h: Number(t.priceChange24h) || 0, source: "db" });
                    rehydrateTasks.push(this.rehydrateRedisPrice(cluster, t.address, priceUsd));
                }
            }
            await Promise.all(rehydrateTasks);
        }

        for (const mint of mints) {
            if (!result.has(mint)) {
                result.set(mint, { priceUsd: 0, priceChange24h: 0, source: "db" });
            }
        }

        return result;
    }

    private isValidWritePrice(price: number): boolean {
        return Number.isFinite(price) && price > 0;
    }

    private async rehydrateRedisPrice(cluster: Cluster, mint: string, priceUsd: number): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        const key = RedisService.KEYS.TOKEN_PRICE_LATEST(cluster, mint);

        try {
            await redis.eval(
                TokenPriceService.REHYDRATE_LATEST_PRICE_SCRIPT,
                1,
                key,
                String(TokenPriceService.FRESH_MIN_TTL_S),
                String(TokenPriceService.PRICE_TTL_S),
                String(priceUsd)
            );
        } catch (error) {
            this.logger.debug(`Failed to rehydrate Redis price for ${cluster}:${mint}: ${getErrorMessage(error)}`);
        }
    }

    private async getFreshRedisPrice(cluster: Cluster, mint: string): Promise<number | null> {
        const key = RedisService.KEYS.TOKEN_PRICE_LATEST(cluster, mint);

        try {
            const [cached, ttl] = await Promise.all([this.redisService.hgetall(key), this.redisService.ttl(key)]);
            if (!cached?.price_usd) return null;

            const priceUsd = parseFloat(cached.price_usd);
            if (!Number.isFinite(priceUsd) || priceUsd <= 0) return null;
            if (ttl < TokenPriceService.FRESH_MIN_TTL_S) {
                this.logger.debug(`Redis price stale for ${mint} (ttl=${ttl}s), fetching fallback price`);
                return null;
            }

            return priceUsd;
        } catch (error) {
            this.logger.debug(`Redis price lookup failed for ${mint}: ${getErrorMessage(error)}`);
            return null;
        }
    }

    async getPriceHistory(cluster: Cluster, mint: string, fromSec: number, toSec: number): Promise<Map<number, number>> {
        // 86400 = seconds / day
        const fromDay = Math.floor(fromSec / 86400) * 86400;
        const toDay = Math.ceil(toSec / 86400) * 86400;

        if (cluster !== "mainnet") {
            this.logger.warn(`Price history requested for non-mainnet mint ${mint} on ${cluster}, returning empty history`);
            return new Map();
        }

        const token = await this.tokenRepository.findOne({
            where: { address: mint, network: cluster },
            select: ["coingeckoId"]
        });

        if (!token?.coingeckoId) return new Map();

        // Cache price history per (mint, fromDay, toDay) for 1h to avoid repeated CoinGecko calls
        const redis = this.redisService.getClient();
        const cacheKey = `price_history:${cluster}:${mint}:${fromDay}:${toDay}`;
        if (redis) {
            try {
                const raw = await redis.get(cacheKey);
                if (raw) {
                    const cached = JSON.parse(raw) as [number, number][];
                    const priceChart = new Map<number, number>();
                    for (const [tsMs, price] of cached) {
                        const dayTs = Math.floor(tsMs / 1000 / 86400) * 86400;
                        priceChart.set(dayTs, price);
                    }
                    return priceChart;
                }
            } catch {
                // cache miss, proceed
            }
        }

        try {
            const data = await this.coinGeckoService.getMarketChartRange(cluster, token.coingeckoId, "usd", fromDay, toDay);
            const priceChart = new Map<number, number>();
            for (const [tsMs, price] of data.prices) {
                const dayTs = Math.floor(tsMs / 1000 / 86400) * 86400;
                priceChart.set(dayTs, price);
            }
            // Cache raw pairs for 1 hour
            if (redis) {
                await redis.setex(cacheKey, 3600, JSON.stringify(data.prices));
            }
            return priceChart;
        } catch (error) {
            logError(this.logger, `Failed to fetch price history from CoinGecko for mint ${mint}`, error);
            return new Map();
        }
    }
}

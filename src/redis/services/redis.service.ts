import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisService as NestRedisService } from "@liaoliaots/nestjs-redis";
import { getErrorMessage, logError } from "../../common/errors/error-helper";
import { redisKeys, type RedisKey } from "../utils/redisKeys";
import { redisTtls, type RedisTtlValue } from "../utils/redisTtls";
import { OHLC_INTERVAL_TTLS } from "../constants";

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly redis: Redis | null;
    private readonly logger = new Logger(RedisService.name);

    public static readonly KEYS = redisKeys({
        TOKEN_PRICE_LATEST: (network: string, mint: string) => `price:${network}:${mint}:latest`,
        TOKEN_PRICE_HISTORY: (network: string, mint: string) => `price:${network}:${mint}:history`,
        TOKEN_METADATA: (network: string, mint: string) => `token:meta:${network}:${mint}`,
        TOKEN_SUMMARY: (network: string, address: string) => `token:summary:${network}:${address}`,
        DISCOVERY_TRENDING_WINDOW: (network: string, sortBy: string, window: number) => `discovery:${network}:trending:${sortBy}:${window}`,
        DISCOVERY_TRENDING_TOTAL: (network: string, sortBy: string) => `discovery:${network}:trending:${sortBy}:total`,
        DISCOVERY_CATEGORIES_WINDOW: (window: number) => `discovery:categories:${window}`,
        DISCOVERY_CATEGORIES_TOTAL: () => `discovery:categories:total`,
        DISCOVERY_CATEGORY_DETAIL: (slug: string) => `discovery:category:${slug}`,
        SWAP_FEE_CACHE: () => `swap:info:fees:v1`,
        SWAP_KORA_CACHE: () => `swap:info:gasless:v1`,
        HOLDER_MINT_WALLET: (network: string, mint: string, wallet: string) => `holder:${network}:${mint}:${wallet}`,
        HOLDER_RANKING: (network: string, mint: string) => `holders:${network}:${mint}:ranked`,
        TRADER_POSITION: (network: string, mint: string, wallet: string) => `trader:${network}:${mint}:${wallet}`,
        TRADER_RANKING: (network: string, mint: string) => `traders:${network}:${mint}:by_volume`,
        OHLC_BUCKET: (network: string, mint: string, interval: string, bucket: string | number) => `ohlc:${network}:${mint}:${interval}:${bucket}`,
        OHLC_LAST_CLOSE: (network: string, mint: string, interval: string) => `ohlc:${network}:${mint}:${interval}:last_close`,
        SUPPLY: (network: string, mint: string) => `supply:${network}:${mint}`,
        VOLUME_24H: (network: string, mint: string) => `volume:${network}:${mint}:24h`,
        TXNS_24H: (network: string, mint: string) => `txns:${network}:${mint}:24h`,
        TRADES_24H: (network: string, mint: string) => `trades:${network}:${mint}`
    });

    public static readonly TTL = redisTtls({
        TOKEN_PRICE_LATEST: 60,
        TOKEN_PRICE_HISTORY: 25 * 60 * 60,
        TOKEN_METADATA: 24 * 60 * 60,
        HOLDER_MINT_WALLET: 24 * 60 * 60,
        HOLDER_RANKING: 24 * 60 * 60,
        TRADER_POSITION: 24 * 60 * 60,
        TRADER_RANKING: 24 * 60 * 60,
        SUPPLY: 60,
        VOLUME_24H: 25 * 60 * 60,
        TXNS_24H: 25 * 60 * 60,
        TRADES_24H: 25 * 60 * 60,
        OHLC_BUCKET: (interval: string) => OHLC_INTERVAL_TTLS[interval as keyof typeof OHLC_INTERVAL_TTLS] ?? 60 * 60,
        OHLC_LAST_CLOSE: (interval: string) => (OHLC_INTERVAL_TTLS[interval as keyof typeof OHLC_INTERVAL_TTLS] ?? 60 * 60) * 3
    } satisfies Partial<Record<keyof typeof RedisService.KEYS, RedisTtlValue>>);

    constructor(private readonly nestRedisService: NestRedisService) {
        try {
            this.redis = this.nestRedisService.getOrThrow();
        } catch (error) {
            this.logger.warn(`Redis client unavailable, running without Redis cache: ${getErrorMessage(error)}`);
            this.redis = null;
        }
    }

    getClient(): Redis | null {
        return this.redis;
    }

    async get<T = string>(key: RedisKey): Promise<T | null> {
        if (!this.redis) return null;
        try {
            const value = await this.redis.get(key);
            if (!value) return null;
            try {
                return JSON.parse(value) as T;
            } catch {
                return value as T;
            }
        } catch (error) {
            logError(this.logger, `Redis get error for key "${key}"`, error);
            return null;
        }
    }

    async set<T>(key: RedisKey, value: T, ttl?: number): Promise<void> {
        if (!this.redis) return;
        try {
            const stringValue = typeof value === "string" ? value : JSON.stringify(value);
            if (ttl) {
                await this.redis.setex(key, ttl, stringValue);
            } else {
                await this.redis.set(key, stringValue);
            }
        } catch (error) {
            logError(this.logger, `Redis set error for key "${key}"`, error);
        }
    }

    async del(key: RedisKey): Promise<number> {
        if (!this.redis) return 0;
        try {
            return await this.redis.del(key);
        } catch (error) {
            logError(this.logger, `Redis del error for key "${key}"`, error);
            return 0;
        }
    }

    async exists(key: RedisKey): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.exists(key);
            return result === 1;
        } catch (error) {
            logError(this.logger, `Redis exists error for key "${key}"`, error);
            return false;
        }
    }

    async expire(key: RedisKey, seconds: number): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.expire(key, seconds);
            return result === 1;
        } catch (error) {
            logError(this.logger, `Redis expire error for key "${key}"`, error);
            return false;
        }
    }

    async ttl(key: RedisKey): Promise<number> {
        if (!this.redis) return -1;
        try {
            return await this.redis.ttl(key);
        } catch (error) {
            logError(this.logger, `Redis ttl error for key "${key}"`, error);
            return -1;
        }
    }

    async keys(pattern: string): Promise<RedisKey[]> {
        if (!this.redis) return [];
        try {
            return (await this.redis.keys(pattern)) as RedisKey[];
        } catch (error) {
            logError(this.logger, `Redis keys error for pattern "${pattern}"`, error);
            return [];
        }
    }

    async hset(key: RedisKey, data: Record<string, string | number>): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.hset(key, data);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (err.message.includes("WRONGTYPE")) {
                // Key exists as wrong type (e.g. legacy string) — delete and recreate as hash
                await this.redis.del(key);
                await this.redis.hset(key, data);
                return;
            }
            logError(this.logger, `Redis hset error for key "${key}"`, error);
        }
    }

    async hget(key: RedisKey, field: string): Promise<string | null> {
        if (!this.redis) return null;
        try {
            return await this.redis.hget(key, field);
        } catch (error) {
            logError(this.logger, `Redis hget error for key "${key}" field "${field}"`, error);
            return null;
        }
    }

    async hgetall(key: RedisKey): Promise<Record<string, string> | null> {
        if (!this.redis) return null;
        try {
            const result = await this.redis.hgetall(key);
            return Object.keys(result).length > 0 ? result : null;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            if (err.message.includes("WRONGTYPE")) {
                await this.redis.del(key);
                return null;
            }
            logError(this.logger, `Redis hgetall error for key "${key}"`, error);
            return null;
        }
    }

    async flushdb(): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.flushdb();
        } catch (error) {
            logError(this.logger, "Redis flushdb error", error);
        }
    }

    onModuleDestroy() {
        this.redis?.disconnect();
    }
}

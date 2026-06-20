import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisService as NestRedisService } from "@liaoliaots/nestjs-redis";

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly redis: Redis | null;
    private readonly logger = new Logger(RedisService.name);

    public static readonly KEYS = {
        TOKEN_PRICE_LATEST: (network: string, mint: string) => `price:${network}:${mint}:latest`,
        TOKEN_PRICE_HISTORY: (network: string, mint: string) => `price:${network}:${mint}:history`,
        TOKEN_METADATA: (network: string, mint: string) => `token:meta:${network}:${mint}`,
        HOLDER_MINT_WALLET: (network: string, mint: string, wallet: string) => `holder:${network}:${mint}:${wallet}`,
        SUPPLY: (network: string, mint: string) => `supply:${network}:${mint}`,
        VOLUME_24H: (network: string, mint: string) => `volume:${network}:${mint}:24h`
    };

    public static readonly TTL = {
        TOKEN_PRICE_LATEST: 60, // 1 minute
        TOKEN_PRICE_HISTORY: 3600, // 1 hour
        TOKEN_METADATA: 24 * 60 * 60 // 24 hours
    };

    constructor(private readonly nestRedisService: NestRedisService) {
        try {
            this.redis = this.nestRedisService.getOrThrow();
        } catch (error) {
            this.logger.warn("Redis client unavailable, running without Redis cache", error);
            this.redis = null;
        }
    }

    getClient(): Redis | null {
        return this.redis;
    }

    async get<T = string>(key: string): Promise<T | null> {
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
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis get error for key "${key}": ${err.message}`, err.stack);
            return null;
        }
    }

    async set<T>(key: string, value: T, ttl?: number): Promise<void> {
        if (!this.redis) return;
        try {
            const stringValue = typeof value === "string" ? value : JSON.stringify(value);
            if (ttl) {
                await this.redis.setex(key, ttl, stringValue);
            } else {
                await this.redis.set(key, stringValue);
            }
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis set error for key "${key}": ${err.message}`, err.stack);
        }
    }

    async del(key: string): Promise<number> {
        if (!this.redis) return 0;
        try {
            return await this.redis.del(key);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis del error for key "${key}": ${err.message}`, err.stack);
            return 0;
        }
    }

    async exists(key: string): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.exists(key);
            return result === 1;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis exists error for key "${key}": ${err.message}`, err.stack);
            return false;
        }
    }

    async expire(key: string, seconds: number): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.expire(key, seconds);
            return result === 1;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis expire error for key "${key}": ${err.message}`, err.stack);
            return false;
        }
    }

    async ttl(key: string): Promise<number> {
        if (!this.redis) return -1;
        try {
            return await this.redis.ttl(key);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis ttl error for key "${key}": ${err.message}`, err.stack);
            return -1;
        }
    }

    async keys(pattern: string): Promise<string[]> {
        if (!this.redis) return [];
        try {
            return await this.redis.keys(pattern);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis keys error for pattern "${pattern}": ${err.message}`, err.stack);
            return [];
        }
    }

    async hset(key: string, data: Record<string, string | number>): Promise<void> {
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
            this.logger.error(`Redis hset error for key "${key}": ${err.message}`, err.stack);
        }
    }

    async hget(key: string, field: string): Promise<string | null> {
        if (!this.redis) return null;
        try {
            return await this.redis.hget(key, field);
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis hget error for key "${key}" field "${field}": ${err.message}`, err.stack);
            return null;
        }
    }

    async hgetall(key: string): Promise<Record<string, string> | null> {
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
            this.logger.error(`Redis hgetall error for key "${key}": ${err.message}`, err.stack);
            return null;
        }
    }

    async flushdb(): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.flushdb();
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis flushdb error: ${err.message}`, err.stack);
        }
    }

    onModuleDestroy() {
        this.redis?.disconnect();
    }
}

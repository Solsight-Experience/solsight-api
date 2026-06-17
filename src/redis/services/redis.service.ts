import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisService as NestRedisService } from "@liaoliaots/nestjs-redis";

@Injectable()
export class RedisService implements OnModuleDestroy {
    private readonly redis: Redis | null;
    private readonly logger = new Logger(RedisService.name);

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
            this.logger.error(`Redis get error for key "${key}": ${error?.message}`, error?.stack);
            return null;
        }
    }

    async set(key: string, value: any, ttl?: number): Promise<void> {
        if (!this.redis) return;
        try {
            const stringValue = typeof value === "string" ? value : JSON.stringify(value);
            if (ttl) {
                await this.redis.setex(key, ttl, stringValue);
            } else {
                await this.redis.set(key, stringValue);
            }
        } catch (error) {
            this.logger.error(`Redis set error for key "${key}": ${error?.message}`, error?.stack);
        }
    }

    async del(key: string): Promise<number> {
        if (!this.redis) return 0;
        try {
            return await this.redis.del(key);
        } catch (error) {
            this.logger.error(`Redis del error for key "${key}": ${error?.message}`, error?.stack);
            return 0;
        }
    }

    async exists(key: string): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.exists(key);
            return result === 1;
        } catch (error) {
            this.logger.error(`Redis exists error for key "${key}": ${error?.message}`, error?.stack);
            return false;
        }
    }

    async expire(key: string, seconds: number): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.expire(key, seconds);
            return result === 1;
        } catch (error) {
            this.logger.error(`Redis expire error for key "${key}": ${error?.message}`, error?.stack);
            return false;
        }
    }

    async ttl(key: string): Promise<number> {
        if (!this.redis) return -1;
        try {
            return await this.redis.ttl(key);
        } catch (error) {
            this.logger.error(`Redis ttl error for key "${key}": ${error?.message}`, error?.stack);
            return -1;
        }
    }

    async keys(pattern: string): Promise<string[]> {
        if (!this.redis) return [];
        try {
            return await this.redis.keys(pattern);
        } catch (error) {
            this.logger.error(`Redis keys error for pattern "${pattern}": ${error?.message}`, error?.stack);
            return [];
        }
    }

    async hset(key: string, data: Record<string, string | number>): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.hset(key, data);
        } catch (error) {
            if (error?.message?.includes("WRONGTYPE")) {
                // Key exists as wrong type (e.g. legacy string) — delete and recreate as hash
                await this.redis.del(key);
                await this.redis.hset(key, data);
                return;
            }
            this.logger.error(`Redis hset error for key "${key}": ${error?.message}`, error?.stack);
        }
    }

    async hget(key: string, field: string): Promise<string | null> {
        if (!this.redis) return null;
        try {
            return await this.redis.hget(key, field);
        } catch (error) {
            this.logger.error(`Redis hget error for key "${key}" field "${field}": ${error?.message}`, error?.stack);
            return null;
        }
    }

    async hgetall(key: string): Promise<Record<string, string> | null> {
        if (!this.redis) return null;
        try {
            const result = await this.redis.hgetall(key);
            return Object.keys(result).length > 0 ? result : null;
        } catch (error) {
            if (error?.message?.includes("WRONGTYPE")) {
                await this.redis.del(key);
                return null;
            }
            this.logger.error(`Redis hgetall error for key "${key}": ${error?.message}`, error?.stack);
            return null;
        }
    }

    async flushdb(): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.flushdb();
        } catch (error) {
            this.logger.error(`Redis flushdb error: ${error?.message}`, error?.stack);
        }
    }

    onModuleDestroy() {
        this.redis?.disconnect();
    }
}

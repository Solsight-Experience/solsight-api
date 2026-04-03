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
        } catch (error: any) {
            if (error.message?.includes('WRONGTYPE')) {
                this.logger.warn(`Redis WRONGTYPE for key "${key}" - key may be stored as hash/list/set instead of string`);
            } else {
                this.logger.error(`Redis get error for key "${key}": ${error.message}`);
            }
            return null;
        }
    }

    async getHash<T extends Record<string, any> = Record<string, string>>(key: string): Promise<T | null> {
        if (!this.redis) return null;
        try {
            const data = await this.redis.hgetall(key);
            if (!data || Object.keys(data).length === 0) return null;
            return data as T;
        } catch (error: any) {
            if (error.message?.includes('WRONGTYPE')) {
                this.logger.warn(`Redis WRONGTYPE for key "${key}" - key is not a hash`);
            } else {
                this.logger.error(`Redis getHash error for key "${key}": ${error.message}`);
            }
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
            this.logger.error(`Redis set error for key "${key}":`, error);
        }
    }

    async del(key: string): Promise<number> {
        if (!this.redis) return 0;
        try {
            return await this.redis.del(key);
        } catch (error) {
            this.logger.error(`Redis del error for key "${key}":`, error);
            return 0;
        }
    }

    async exists(key: string): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.exists(key);
            return result === 1;
        } catch (error) {
            this.logger.error(`Redis exists error for key "${key}":`, error);
            return false;
        }
    }

    async expire(key: string, seconds: number): Promise<boolean> {
        if (!this.redis) return false;
        try {
            const result = await this.redis.expire(key, seconds);
            return result === 1;
        } catch (error) {
            this.logger.error(`Redis expire error for key "${key}":`, error);
            return false;
        }
    }

    async ttl(key: string): Promise<number> {
        if (!this.redis) return -1;
        try {
            return await this.redis.ttl(key);
        } catch (error) {
            this.logger.error(`Redis ttl error for key "${key}":`, error);
            return -1;
        }
    }

    async keys(pattern: string): Promise<string[]> {
        if (!this.redis) return [];
        try {
            return await this.redis.keys(pattern);
        } catch (error) {
            this.logger.error(`Redis keys error for pattern "${pattern}":`, error);
            return [];
        }
    }

    async flushdb(): Promise<void> {
        if (!this.redis) return;
        try {
            await this.redis.flushdb();
        } catch (error) {
            this.logger.error("Redis flushdb error:", error);
        }
    }

    onModuleDestroy() {
        this.redis?.disconnect();
    }
}

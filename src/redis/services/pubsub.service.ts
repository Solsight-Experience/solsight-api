import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisService as NestRedisService } from "@liaoliaots/nestjs-redis";

@Injectable()
export class PubSubService implements OnModuleDestroy {
    private readonly publisher: Redis | null;
    private readonly subscriber: Redis | null;
    private readonly logger = new Logger(PubSubService.name);
    private readonly handlers = new Map<string, Array<(message: unknown, channel: string) => void>>();
    private readonly patternHandlers = new Map<string, Array<(message: unknown, channel: string) => void>>();

    constructor(private readonly redisService: NestRedisService) {
        try {
            const baseRedis = this.redisService.getOrThrow();
            this.publisher = baseRedis.duplicate();
            this.subscriber = baseRedis.duplicate();

            this.publisher.on("error", (err) => {
                this.logger.error("Redis publisher error:", err);
            });

            this.subscriber.on("error", (err) => {
                this.logger.error("Redis subscriber error:", err);
            });

            this.subscriber.on("message", (channel: string, message: string) => {
                const callbacks = this.handlers.get(channel) ?? [];
                const parsed = this.parsePayload(message, channel, "channel");
                if (parsed == null) return;
                for (const callback of callbacks) {
                    try {
                        callback(parsed, channel);
                    } catch (error) {
                        this.logger.error(`Redis subscriber handler threw on channel "${channel}"`, error);
                    }
                }
            });

            this.subscriber.on("pmessage", (pattern: string, channel: string, message: string) => {
                const callbacks = this.patternHandlers.get(pattern) ?? [];
                const parsed = this.parsePayload(message, pattern, "pattern");
                if (parsed == null) return;
                for (const callback of callbacks) {
                    try {
                        callback(parsed, channel);
                    } catch (error) {
                        this.logger.error(`Redis pattern handler threw on pattern "${pattern}"`, error);
                    }
                }
            });
        } catch (error) {
            this.logger.warn("PubSub unavailable, running without Redis Pub/Sub", error);
            this.publisher = null;
            this.subscriber = null;
        }
    }

    async publish<T>(channel: string, message: T): Promise<number> {
        if (!this.publisher) return 0;
        try {
            const payload = typeof message === "string" ? message : JSON.stringify(message);
            return await this.publisher.publish(channel, payload);
        } catch (error) {
            this.logger.error(`Redis publish error on channel "${channel}":`, error);
            return 0;
        }
    }

    async subscribe<T = string>(channel: string, handler: (message: T, channel: string) => void): Promise<void> {
        if (!this.subscriber) {
            this.logger.warn(`Cannot subscribe to "${channel}": Redis unavailable`);
            return;
        }
        const wrapped = (message: unknown, receivedChannel: string): void => {
            handler(message as T, receivedChannel);
        };

        const existing = this.handlers.get(channel);
        if (existing) {
            existing.push(wrapped);
            return;
        }

        this.handlers.set(channel, [wrapped]);
        try {
            await this.subscriber.subscribe(channel);
            this.logger.log(`Subscribed to channel: ${channel}`);
        } catch (error) {
            this.handlers.delete(channel);
            this.logger.error(`Redis subscribe error for channel "${channel}":`, error);
        }
    }

    async unsubscribe(channel: string): Promise<void> {
        if (!this.subscriber) return;
        if (!this.handlers.has(channel)) return;
        this.handlers.delete(channel);
        try {
            await this.subscriber.unsubscribe(channel);
            this.logger.log(`Unsubscribed from channel: ${channel}`);
        } catch (error) {
            this.logger.error(`Redis unsubscribe error for channel "${channel}":`, error);
        }
    }

    async psubscribe<T = string>(pattern: string, handler: (message: T, channel: string) => void): Promise<void> {
        if (!this.subscriber) {
            this.logger.warn(`Cannot psubscribe to "${pattern}": Redis unavailable`);
            return;
        }
        const wrapped = (message: unknown, channel: string): void => {
            handler(message as T, channel);
        };

        const existing = this.patternHandlers.get(pattern);
        if (existing) {
            existing.push(wrapped);
            return;
        }

        this.patternHandlers.set(pattern, [wrapped]);
        try {
            await this.subscriber.psubscribe(pattern);
            this.logger.log(`Pattern subscribed: ${pattern}`);
        } catch (error) {
            this.patternHandlers.delete(pattern);
            this.logger.error(`Redis psubscribe error for pattern "${pattern}":`, error);
        }
    }

    getPublisher(): Redis | null {
        return this.publisher;
    }

    getSubscriber(): Redis | null {
        return this.subscriber;
    }

    async onModuleDestroy() {
        try {
            if (this.subscriber) await this.subscriber.quit();
            if (this.publisher) await this.publisher.quit();
            this.logger.log("PubSub connections closed");
        } catch (error) {
            this.logger.error("Error closing PubSub connections:", error);
        }
    }

    private parsePayload(message: string, name: string, kind: "channel" | "pattern"): Record<string, unknown> | null {
        try {
            const parsed = JSON.parse(message) as unknown;
            if (parsed && typeof parsed === "object") {
                return parsed as Record<string, unknown>;
            }

            this.logger.error(`Redis ${kind} payload on "${name}" was not a JSON object`);
            return null;
        } catch (error) {
            this.logger.error(`Redis ${kind} payload parse error for "${name}"`, error);
            return null;
        }
    }
}

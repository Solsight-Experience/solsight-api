import { Injectable, OnModuleDestroy, Logger } from "@nestjs/common";
import { Redis } from "ioredis";
import { RedisService as NestRedisService } from "@liaoliaots/nestjs-redis";

@Injectable()
export class PubSubService implements OnModuleDestroy {
    private readonly publisher: Redis | null;
    private readonly subscriber: Redis | null;
    private readonly logger = new Logger(PubSubService.name);

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
        } catch (error) {
            this.logger.warn("PubSub unavailable, running without Redis Pub/Sub", error);
            this.publisher = null;
            this.subscriber = null;
        }
    }

    async publish(channel: string, message: any): Promise<number> {
        if (!this.publisher) return 0;
        try {
            const payload = typeof message === "string" ? message : JSON.stringify(message);
            return await this.publisher.publish(channel, payload);
        } catch (error) {
            this.logger.error(`Redis publish error on channel "${channel}":`, error);
            return 0;
        }
    }

    async subscribe(channel: string, handler: (message: any, channel: string) => void): Promise<void> {
        if (!this.subscriber) {
            this.logger.warn(`Cannot subscribe to "${channel}": Redis unavailable`);
            return;
        }
        try {
            await this.subscriber.subscribe(channel);

            this.subscriber.on("message", (ch: string, msg: string) => {
                if (ch === channel) {
                    try {
                        const parsed = JSON.parse(msg);
                        handler(parsed, ch);
                    } catch {
                        handler(msg, ch);
                    }
                }
            });

            this.logger.log(`Subscribed to channel: ${channel}`);
        } catch (error) {
            this.logger.error(`Redis subscribe error for channel "${channel}":`, error);
        }
    }

    async unsubscribe(channel: string): Promise<void> {
        if (!this.subscriber) return;
        try {
            await this.subscriber.unsubscribe(channel);
            this.logger.log(`Unsubscribed from channel: ${channel}`);
        } catch (error) {
            this.logger.error(`Redis unsubscribe error for channel "${channel}":`, error);
        }
    }

    async psubscribe(pattern: string, handler: (message: any, channel: string) => void): Promise<void> {
        if (!this.subscriber) {
            this.logger.warn(`Cannot psubscribe to "${pattern}": Redis unavailable`);
            return;
        }
        try {
            await this.subscriber.psubscribe(pattern);

            this.subscriber.on("pmessage", (pat: string, ch: string, msg: string) => {
                if (pat === pattern) {
                    try {
                        const parsed = JSON.parse(msg);
                        handler(parsed, ch);
                    } catch {
                        handler(msg, ch);
                    }
                }
            });

            this.logger.log(`Pattern subscribed: ${pattern}`);
        } catch (error) {
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
}

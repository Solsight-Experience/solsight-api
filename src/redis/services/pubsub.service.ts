import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService as NestRedisService } from '@liaoliaots/nestjs-redis';

@Injectable()
export class PubSubService implements OnModuleDestroy {
  private readonly publisher: Redis;
  private readonly subscriber: Redis;
  private readonly logger = new Logger(PubSubService.name);

  constructor(private readonly redisService: NestRedisService) {
    const baseRedis = this.redisService.getOrThrow();
    this.publisher = baseRedis.duplicate();
    this.subscriber = baseRedis.duplicate();
  }

  async publish(channel: string, message: any): Promise<number> {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    return this.publisher.publish(channel, payload);
  }

  async subscribe(channel: string, handler: (message: any, channel: string) => void): Promise<void> {
    await this.subscriber.subscribe(channel);

    this.subscriber.on('message', (ch: string, msg: string) => {
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
  }

  async unsubscribe(channel: string): Promise<void> {
    await this.subscriber.unsubscribe(channel);
    this.logger.log(`Unsubscribed from channel: ${channel}`);
  }

  async psubscribe(pattern: string, handler: (message: any, channel: string) => void): Promise<void> {
    await this.subscriber.psubscribe(pattern);

    this.subscriber.on('pmessage', (pat: string, ch: string, msg: string) => {
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
  }

  getPublisher(): Redis {
    return this.publisher;
  }

  getSubscriber(): Redis {
    return this.subscriber;
  }

  async onModuleDestroy() {
    await this.subscriber.quit();
    await this.publisher.quit();
    this.logger.log('PubSub connections closed');
  }
}

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService, DEFAULT_REDIS } from '@liaoliaots/nestjs-redis';

@Injectable()
export class PubSubService implements OnModuleDestroy {
  private readonly redis: Redis | null;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrThrow().duplicate();
  }

  getRedis() {
    if (!this.redis) {
      throw new Error('Redis not initialized');
    }
    return this.redis;
  }

  onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}

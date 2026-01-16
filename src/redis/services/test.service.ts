import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { RedisService, DEFAULT_REDIS } from '@liaoliaots/nestjs-redis';

@Injectable()
export class RedisTestService implements OnModuleInit, OnModuleDestroy {
  private readonly redis: Redis | null;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  async onModuleInit() {
    try {
      await this.redis?.set('test-key', 'hello world');
      const value = await this.redis?.get('test-key');
      console.log('Redis test value:', value);
    } catch (err) {
      console.error('Redis connection error:', err);
    }
  }

  onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
    }
  }
}

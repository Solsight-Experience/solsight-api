import { ConfigService } from '@nestjs/config';
import { RedisModuleOptions } from '@liaoliaots/nestjs-redis';

export const getRedisConfig = (configService: ConfigService): RedisModuleOptions => {
  const url = configService.get<string>('redis.url');

  if (!url) {
    throw new Error('Missing Redis configuration: REDIS_URL is required');
  }

  return {
    config: {
      url,
    },
    readyLog: true,
    closeClient: true,
  };
};

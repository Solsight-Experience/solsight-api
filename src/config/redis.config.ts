import { ConfigService } from '@nestjs/config';
import { RedisModuleOptions } from '@liaoliaots/nestjs-redis';

export const getRedisConfig = (
  configService: ConfigService,
): RedisModuleOptions => {
  const url = configService.get<string>('redis.url');

  // Ưu tiên sử dụng URL (Upstash)
  if (url) {
    return {
      config: {
        url,
      },
      readyLog: true,
      closeClient: true,
    };
  }

  // Fallback: dùng host/port/password (local development)
  const host = configService.get<string>('redis.host');
  const port = Number(configService.get<number>('redis.port'));
  const password = configService.get<string>('redis.password') || '';

  if (!host || !port) {
    throw new Error('Missing Redis configuration');
  }

  return {
    config: {
      host,
      port,
      password,
    },
    readyLog: true,
    closeClient: true,
  };
};

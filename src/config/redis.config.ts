import { ConfigService } from '@nestjs/config';
import { RedisModuleOptions } from '@liaoliaots/nestjs-redis';

export const getRedisConfig = (
  configService: ConfigService,
): RedisModuleOptions => {
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

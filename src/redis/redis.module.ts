import { Module } from '@nestjs/common';
import { RedisModule as NestRedisModule } from '@liaoliaots/nestjs-redis';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getRedisConfig } from '../config/redis.config';
import { RedisTestService } from './services/test.service';

@Module({
  imports: [
    NestRedisModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: getRedisConfig,
      inject: [ConfigService],
    }),
  ],
  providers: [RedisTestService],
  exports: [NestRedisModule],
})
export class RedisModule {}

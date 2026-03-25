import { Module } from "@nestjs/common";
import { RedisModule as NestRedisModule } from "@liaoliaots/nestjs-redis";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { getRedisConfig } from "../config/redis.config";
import { RedisService } from "./services/redis.service";
import { PubSubService } from "./services/pubsub.service";
import { RedisTestService } from "./services/test.service";

@Module({
    imports: [
        NestRedisModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: getRedisConfig,
            inject: [ConfigService]
        })
    ],
    providers: [RedisService, PubSubService, RedisTestService],
    exports: [NestRedisModule, RedisService, PubSubService]
})
export class RedisModule {}

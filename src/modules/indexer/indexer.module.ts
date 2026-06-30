import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MarketPriceEvent } from "./entities/market-price-event.entity";
import { Transaction } from "../transactions/entities/transaction.entity";
import { StreamConsumerService } from "./services/stream-consumer.service";
import { RedisModule } from "../../redis/redis.module";
import { TokensModule } from "../tokens/tokens.module";

@Module({
    imports: [TypeOrmModule.forFeature([MarketPriceEvent, Transaction]), RedisModule, TokensModule],
    providers: [StreamConsumerService]
})
export class IndexerModule {}

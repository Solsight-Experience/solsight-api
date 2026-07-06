import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MarketPriceEvent } from "./entities/market-price-event.entity";
import { Transaction } from "../transactions/entities/transaction.entity";
import { StreamConsumerService } from "./services/stream-consumer.service";
import { RedisModule } from "../../redis/redis.module";
import { TokensModule } from "../tokens/tokens.module";
import { Token } from "../tokens/entities/token.entity";
import { MarketPriceUpdateHandler } from "./services/market-price-update.handler";
import { TokenPricePersistorService } from "./services/token-price-persistor.service";

@Module({
    imports: [TypeOrmModule.forFeature([MarketPriceEvent, Transaction, Token]), RedisModule, TokensModule],
    providers: [StreamConsumerService, MarketPriceUpdateHandler, TokenPricePersistorService]
})
export class IndexerModule {}

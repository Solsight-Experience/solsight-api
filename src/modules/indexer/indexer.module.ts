import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { MarketPriceEvent } from "./entities/market-price-event.entity";
import { Transaction } from "../transactions/entities/transaction.entity";
import { Token } from "../tokens/entities/token.entity";
import { StreamConsumerService } from "./services/stream-consumer.service";
import { RedisModule } from "../../redis/redis.module";
import { INDEXER_EVENT_HANDLERS_TOKEN } from "../../redis/event-handler";
import { TokensModule } from "../tokens/tokens.module";

@Module({
    imports: [TypeOrmModule.forFeature([MarketPriceEvent, Transaction, Token]), RedisModule, TokensModule],
    providers: [
        StreamConsumerService,
        {
            provide: INDEXER_EVENT_HANDLERS_TOKEN,
            useFactory: (streamConsumerService: StreamConsumerService) => [streamConsumerService],
            inject: [StreamConsumerService]
        }
    ],
    exports: [INDEXER_EVENT_HANDLERS_TOKEN]
})
export class IndexerModule {}

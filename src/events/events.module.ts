import { Module } from "@nestjs/common";
import { DiscoveryModule as NestDiscoveryModule } from "@nestjs/core";
import { EventStreamDispatcher } from "./event-stream-dispatcher.service";
import { IndexerModule } from "../modules/indexer/indexer.module";
import { TokensModule } from "../modules/tokens/tokens.module";
import { RedisModule } from "../redis/redis.module";

@Module({
    imports: [RedisModule, IndexerModule, TokensModule, NestDiscoveryModule],
    providers: [EventStreamDispatcher]
})
export class EventsModule {}

import { Module } from "@nestjs/common";
import { EventStreamDispatcher } from "./event-stream-dispatcher.service";
import { IndexerModule } from "../modules/indexer/indexer.module";
import { TokensModule } from "../modules/tokens/tokens.module";
import { RedisModule } from "../redis/redis.module";
import { EVENT_HANDLER_TOKEN, INDEXER_EVENT_HANDLERS_TOKEN, TOKENS_EVENT_HANDLERS_TOKEN } from "../redis/event-handler";
import type { EventHandler } from "../redis/event-handler";

@Module({
    imports: [RedisModule, IndexerModule, TokensModule],
    providers: [
        {
            provide: EVENT_HANDLER_TOKEN,
            useFactory: (indexerHandlers: EventHandler[], tokenHandlers: EventHandler[]) => [...indexerHandlers, ...tokenHandlers],
            inject: [INDEXER_EVENT_HANDLERS_TOKEN, TOKENS_EVENT_HANDLERS_TOKEN]
        },
        EventStreamDispatcher
    ]
})
export class EventsModule {}

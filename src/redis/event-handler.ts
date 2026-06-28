import type { RedisChannel } from "./utils/redisChannels";

export const EVENT_HANDLER_TOKEN = Symbol.for("solsight.EVENT_HANDLER");
export const INDEXER_EVENT_HANDLERS_TOKEN = Symbol.for("solsight.INDEXER_EVENT_HANDLERS");
export const TOKENS_EVENT_HANDLERS_TOKEN = Symbol.for("solsight.TOKENS_EVENT_HANDLERS");

export interface EventHandler<TPayload = unknown> {
    channels(): RedisChannel<TPayload>[];
    handle(event: TPayload, channel: RedisChannel<TPayload>): Promise<void> | void;
    readonly name?: string;
}

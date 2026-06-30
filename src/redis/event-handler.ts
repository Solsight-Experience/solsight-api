import type { RedisChannel } from "./utils/redisChannels";

export interface EventHandler<TPayload = unknown> {
    channels(): RedisChannel<TPayload>[];
    handle(event: TPayload, channel: RedisChannel<TPayload>): Promise<void> | void;
    readonly name?: string;
}

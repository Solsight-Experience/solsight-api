import { Inject, Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { EventHandler, EVENT_HANDLER_TOKEN } from "../redis/event-handler";
import { REDIS_CHANNELS } from "../redis/channels";
import { PubSubService } from "../redis/services/pubsub.service";
import type { RedisChannel } from "../redis/utils/redisChannels";

const TRADE_EVENT_PREFIX = REDIS_CHANNELS.TRADE_EVENTS("mainnet").replace("mainnet", "");
const TRADE_TIMESTAMP_SANITY_FLOOR_AGE_S = 365 * 24 * 60 * 60;

@Injectable()
export class EventStreamDispatcher implements OnApplicationBootstrap {
    private readonly logger = new Logger(EventStreamDispatcher.name);

    constructor(
        private readonly pubSubService: PubSubService,
        @Inject(EVENT_HANDLER_TOKEN) private readonly handlers: EventHandler[]
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        if (this.handlers.length === 0) {
            this.logger.warn("EventStreamDispatcher: zero handlers registered");
            return;
        }

        const handlersByChannel = new Map<string, EventHandler[]>();
        for (const handler of this.handlers) {
            for (const channel of handler.channels()) {
                const existing = handlersByChannel.get(channel) ?? [];
                existing.push(handler);
                handlersByChannel.set(channel, existing);
            }
        }

        for (const [channel, handlers] of handlersByChannel.entries()) {
            await this.pubSubService.subscribe(channel, (message: unknown, channelName) => {
                const event = this.parseMessage(message, channelName);
                if (event == null) {
                    return;
                }

                if (channelName.startsWith(TRADE_EVENT_PREFIX)) {
                    this.overrideTradeTimestampWhenInvalid(event, channelName);
                }

                Object.freeze(event);

                for (const handler of handlers) {
                    try {
                        const result = handler.handle(event, channelName as RedisChannel);
                        void Promise.resolve(result).catch((error: unknown) => {
                            this.logger.error(`Handler ${handler.name ?? handler.constructor.name} async-rejected on ${channelName}`, error);
                        });
                    } catch (error) {
                        this.logger.error(`Handler ${handler.name ?? handler.constructor.name} threw on ${channelName}`, error);
                    }
                }
            });
        }

        const channelList = [...handlersByChannel.keys()].sort().join(", ");
        this.logger.log(`EventStreamDispatcher: registered ${this.handlers.length} handlers across ${handlersByChannel.size} channels: [${channelList}]`);
    }

    private parseMessage(message: unknown, channelName: string): Record<string, unknown> | null {
        if (typeof message === "string") {
            try {
                return JSON.parse(message) as Record<string, unknown>;
            } catch (error) {
                this.logger.error(`Failed to JSON.parse message on ${channelName}`, error);
                return null;
            }
        }

        if (message && typeof message === "object") {
            return message as Record<string, unknown>;
        }

        this.logger.error(`Unsupported event payload on ${channelName}`);
        return null;
    }

    private overrideTradeTimestampWhenInvalid(event: Record<string, unknown>, channelName: string): void {
        const timestamp = typeof event.timestamp === "number" ? event.timestamp : Number(event.timestamp);
        const reason =
            !Number.isFinite(timestamp) || Number.isNaN(timestamp)
                ? "missing_or_non_numeric"
                : timestamp <= 0
                  ? "non_positive"
                  : timestamp < this.tradeTimestampSanityFloorSec()
                    ? "below_sanity_floor"
                    : null;

        if (!reason) return;

        // Temporary guard for the upstream indexer `block_time.unwrap_or(0)` bug.
        // Delete this branch after the producer always emits sane timestamps.
        event.timestamp = Math.floor(Date.now() / 1000);
        this.logger.warn(
            JSON.stringify({
                metric: "swap_timestamp_overridden_total",
                channel: channelName,
                signature: typeof event.signature === "string" ? event.signature : null,
                reason
            })
        );
    }

    private tradeTimestampSanityFloorSec(): number {
        return Math.floor(Date.now() / 1000) - TRADE_TIMESTAMP_SANITY_FLOOR_AGE_S;
    }
}

import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { DiscoveryService } from "@nestjs/core";
import type { EventHandler } from "../redis/event-handler";
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
        private readonly discoveryService: DiscoveryService
    ) {}

    async onApplicationBootstrap(): Promise<void> {
        const handlers = this.discoverHandlers();
        if (handlers.length === 0) {
            this.logger.warn("EventStreamDispatcher: zero handlers registered");
            return;
        }

        const handlersByChannel = new Map<string, EventHandler[]>();
        for (const handler of handlers) {
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
        this.logger.log(`EventStreamDispatcher: registered ${handlers.length} handlers across ${handlersByChannel.size} channels: [${channelList}]`);
    }

    private parseMessage(message: unknown, channelName: string): Record<string, unknown> | null {
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

    private discoverHandlers(): EventHandler[] {
        const handlers: EventHandler[] = [];
        const seen = new Set<EventHandler>();

        for (const provider of this.discoveryService.getProviders()) {
            const instance = provider.instance;
            if (!this.isEventHandler(instance) || seen.has(instance)) {
                continue;
            }
            seen.add(instance);
            handlers.push(instance);
        }

        return handlers;
    }

    private isEventHandler(instance: unknown): instance is EventHandler {
        return (
            !!instance &&
            typeof instance === "object" &&
            typeof (instance as EventHandler).channels === "function" &&
            typeof (instance as EventHandler).handle === "function"
        );
    }
}

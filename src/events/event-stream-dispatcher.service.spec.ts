import { Logger } from "@nestjs/common";
import type { DiscoveryService } from "@nestjs/core";
import type { InstanceWrapper } from "@nestjs/core/injector/instance-wrapper";
import { EventStreamDispatcher } from "./event-stream-dispatcher.service";
import { REDIS_CHANNELS } from "../redis/channels";
import type { EventHandler } from "../redis/event-handler";
import type { PubSubService } from "../redis/services/pubsub.service";

describe("EventStreamDispatcher", () => {
    let subscriptions = new Map<string, (message: unknown, channel: string) => void>();
    let pubSubService: jest.Mocked<Pick<PubSubService, "subscribe">>;
    let discoveryService: jest.Mocked<Pick<DiscoveryService, "getProviders">>;

    beforeEach(() => {
        subscriptions = new Map();
        pubSubService = {
            subscribe: jest.fn((channel, handler) => {
                subscriptions.set(channel, handler);
                return Promise.resolve();
            })
        };
        discoveryService = {
            getProviders: jest.fn()
        };
    });

    function provider(instance: unknown): InstanceWrapper {
        return { instance } as InstanceWrapper;
    }

    it("subscribes once per channel and fans out to all matching handlers", async () => {
        const received: object[] = [];
        const handleA = jest.fn((event: unknown) => {
            received.push(event as object);
        });
        const handleB = jest.fn((event: unknown) => {
            received.push(event as object);
        });
        const handlerA: EventHandler = {
            name: "A",
            channels: () => [REDIS_CHANNELS.TRADE_EVENTS("mainnet")],
            handle: handleA
        };
        const handlerB: EventHandler = {
            name: "B",
            channels: () => [REDIS_CHANNELS.TRADE_EVENTS("mainnet")],
            handle: handleB
        };
        discoveryService.getProviders.mockReturnValue([provider(handlerA), provider(handlerB)]);
        const dispatcher = new EventStreamDispatcher(pubSubService as unknown as PubSubService, discoveryService as unknown as DiscoveryService);

        await dispatcher.onApplicationBootstrap();

        expect(pubSubService.subscribe).toHaveBeenCalledTimes(1);
        const callback = subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("mainnet"));
        expect(callback).toBeDefined();

        callback?.({ signature: "sig-1", network: "mainnet" }, REDIS_CHANNELS.TRADE_EVENTS("mainnet"));

        expect(handleA).toHaveBeenCalledTimes(1);
        expect(handleB).toHaveBeenCalledTimes(1);
        expect(received[0]).toBe(received[1]);
    });

    it("overwrites missing trade timestamps, preserves valid ones, and guards very old producer timestamps", async () => {
        const loggerWarnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
        const tradeHandler = jest.fn((event: Record<string, unknown>) => {
            expect(Object.isFrozen(event)).toBe(true);
            expect(typeof event.timestamp).toBe("number");
            expect(() => {
                event.timestamp = 0;
            }).toThrow(TypeError);
        });
        const holderHandler = jest.fn((event: Record<string, unknown>) => {
            expect(event.timestamp).toBeUndefined();
        });
        discoveryService.getProviders.mockReturnValue([
            provider({
                channels: () => [REDIS_CHANNELS.TRADE_EVENTS("devnet")],
                handle: tradeHandler
            } satisfies EventHandler),
            provider({
                channels: () => [REDIS_CHANNELS.HOLDER_UPDATES("mainnet")],
                handle: holderHandler
            } satisfies EventHandler)
        ]);
        const dispatcher = new EventStreamDispatcher(pubSubService as unknown as PubSubService, discoveryService as unknown as DiscoveryService);

        await dispatcher.onApplicationBootstrap();

        const before = Math.floor(Date.now() / 1000);
        subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("devnet"))?.({ signature: "sig-missing", network: "devnet" }, REDIS_CHANNELS.TRADE_EVENTS("devnet"));
        const after = Math.floor(Date.now() / 1000);
        const stampedEvent = tradeHandler.mock.calls[0][0] as { timestamp: number };
        expect(stampedEvent.timestamp).toBeGreaterThanOrEqual(before);
        expect(stampedEvent.timestamp).toBeLessThanOrEqual(after);
        expect(loggerWarnSpy).toHaveBeenCalledWith(
            JSON.stringify({
                metric: "swap_timestamp_overridden_total",
                channel: REDIS_CHANNELS.TRADE_EVENTS("devnet"),
                signature: "sig-missing",
                reason: "missing_or_non_numeric"
            })
        );

        const recentTimestamp = Math.floor(Date.now() / 1000) - 60;
        subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("devnet"))?.(
            { signature: "sig-valid", network: "devnet", timestamp: recentTimestamp },
            REDIS_CHANNELS.TRADE_EVENTS("devnet")
        );
        expect((tradeHandler.mock.calls[1][0] as { timestamp: number }).timestamp).toBe(recentTimestamp);

        const staleTimestamp = Math.floor(Date.now() / 1000) - 366 * 24 * 60 * 60;
        subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("devnet"))?.(
            { signature: "sig-stale", network: "devnet", timestamp: staleTimestamp },
            REDIS_CHANNELS.TRADE_EVENTS("devnet")
        );
        const refreshedEvent = tradeHandler.mock.calls[2][0] as { timestamp: number };
        expect(refreshedEvent.timestamp).toBeGreaterThanOrEqual(before);
        expect(refreshedEvent.timestamp).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
        expect(loggerWarnSpy).toHaveBeenLastCalledWith(
            JSON.stringify({
                metric: "swap_timestamp_overridden_total",
                channel: REDIS_CHANNELS.TRADE_EVENTS("devnet"),
                signature: "sig-stale",
                reason: "below_sanity_floor"
            })
        );

        subscriptions.get(REDIS_CHANNELS.HOLDER_UPDATES("mainnet"))?.({ mint: "mint-1" }, REDIS_CHANNELS.HOLDER_UPDATES("mainnet"));
        expect(holderHandler).toHaveBeenCalledTimes(1);
        loggerWarnSpy.mockRestore();
    });

    it("keeps dispatching when sibling handlers throw or reject", async () => {
        const loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();
        const healthyHandler = { channels: () => [REDIS_CHANNELS.TRADE_EVENTS("mainnet")], handle: jest.fn() };
        const throwingHandler = {
            name: "ThrowingHandler",
            channels: () => [REDIS_CHANNELS.TRADE_EVENTS("mainnet")],
            handle: jest.fn(() => {
                throw new Error("boom");
            })
        };
        const rejectingHandle = jest.fn(() => Promise.reject(new Error("nope")));
        const rejectingHandler = {
            name: "RejectingHandler",
            channels: () => [REDIS_CHANNELS.TRADE_EVENTS("mainnet")],
            handle: rejectingHandle
        };
        discoveryService.getProviders.mockReturnValue([
            provider(throwingHandler as EventHandler),
            provider(rejectingHandler as EventHandler),
            provider(healthyHandler as EventHandler)
        ]);
        const dispatcher = new EventStreamDispatcher(pubSubService as unknown as PubSubService, discoveryService as unknown as DiscoveryService);

        await dispatcher.onApplicationBootstrap();

        subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("mainnet"))?.({ signature: "sig-3", network: "mainnet" }, REDIS_CHANNELS.TRADE_EVENTS("mainnet"));
        await Promise.resolve();

        expect(healthyHandler.handle).toHaveBeenCalledTimes(1);
        expect(loggerErrorSpy).toHaveBeenCalled();
        loggerErrorSpy.mockRestore();
    });

    it("warns when no handlers are registered", async () => {
        const loggerWarnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
        discoveryService.getProviders.mockReturnValue([provider({ healthcheck: true })]);
        const dispatcher = new EventStreamDispatcher(pubSubService as unknown as PubSubService, discoveryService as unknown as DiscoveryService);

        await dispatcher.onApplicationBootstrap();

        expect(loggerWarnSpy).toHaveBeenCalledWith("EventStreamDispatcher: zero handlers registered");
        loggerWarnSpy.mockRestore();
    });
});

import { Logger } from "@nestjs/common";
import { EventStreamDispatcher } from "./event-stream-dispatcher.service";
import { REDIS_CHANNELS } from "../redis/channels";
import type { EventHandler } from "../redis/event-handler";

describe("EventStreamDispatcher", () => {
    let subscriptions = new Map<string, (message: unknown, channel: string) => void>();
    let pubSubService: { subscribe: jest.Mock<Promise<void>, [string, (message: unknown, channel: string) => void]> };

    beforeEach(() => {
        subscriptions = new Map();
        pubSubService = {
            subscribe: jest.fn((channel, handler) => {
                subscriptions.set(channel, handler);
                return Promise.resolve();
            })
        };
    });

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
        const dispatcher = new EventStreamDispatcher(pubSubService as never, [handlerA, handlerB]);

        await dispatcher.onApplicationBootstrap();

        expect(pubSubService.subscribe).toHaveBeenCalledTimes(1);
        const callback = subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("mainnet"));
        expect(callback).toBeDefined();

        callback?.({ signature: "sig-1", network: "mainnet" }, REDIS_CHANNELS.TRADE_EVENTS("mainnet"));

        expect(handleA).toHaveBeenCalledTimes(1);
        expect(handleB).toHaveBeenCalledTimes(1);
        expect(received[0]).toBe(received[1]);
    });

    it("stamps trade timestamps, freezes the event, and preserves non-trade channels", async () => {
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
        const dispatcher = new EventStreamDispatcher(pubSubService as never, [
            {
                channels: () => [REDIS_CHANNELS.TRADE_EVENTS("devnet")],
                handle: tradeHandler
            },
            {
                channels: () => [REDIS_CHANNELS.HOLDER_UPDATES("mainnet")],
                handle: holderHandler
            }
        ]);

        await dispatcher.onApplicationBootstrap();

        const before = Math.floor(Date.now() / 1000);
        subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("devnet"))?.({ signature: "sig-2", network: "devnet" }, REDIS_CHANNELS.TRADE_EVENTS("devnet"));
        const after = Math.floor(Date.now() / 1000);
        const stampedEvent = tradeHandler.mock.calls[0][0] as { timestamp: number };
        expect(stampedEvent.timestamp).toBeGreaterThanOrEqual(before);
        expect(stampedEvent.timestamp).toBeLessThanOrEqual(after);

        subscriptions.get(REDIS_CHANNELS.HOLDER_UPDATES("mainnet"))?.({ mint: "mint-1" }, REDIS_CHANNELS.HOLDER_UPDATES("mainnet"));
        expect(holderHandler).toHaveBeenCalledTimes(1);
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
        const dispatcher = new EventStreamDispatcher(pubSubService as never, [
            throwingHandler as EventHandler,
            rejectingHandler as EventHandler,
            healthyHandler as EventHandler
        ]);

        await dispatcher.onApplicationBootstrap();

        subscriptions.get(REDIS_CHANNELS.TRADE_EVENTS("mainnet"))?.({ signature: "sig-3", network: "mainnet" }, REDIS_CHANNELS.TRADE_EVENTS("mainnet"));
        await Promise.resolve();

        expect(healthyHandler.handle).toHaveBeenCalledTimes(1);
        expect(loggerErrorSpy).toHaveBeenCalled();
        loggerErrorSpy.mockRestore();
    });

    it("warns when no handlers are registered", async () => {
        const loggerWarnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
        const dispatcher = new EventStreamDispatcher(pubSubService as never, []);

        await dispatcher.onApplicationBootstrap();

        expect(loggerWarnSpy).toHaveBeenCalledWith("EventStreamDispatcher: zero handlers registered");
        loggerWarnSpy.mockRestore();
    });
});

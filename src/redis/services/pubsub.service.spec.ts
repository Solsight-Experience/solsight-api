import type { RedisService as NestRedisService } from "@liaoliaots/nestjs-redis";
import { Logger } from "@nestjs/common";
import { PubSubService } from "./pubsub.service";

type Listener = (...args: unknown[]) => void;
type SubscriberDouble = {
    on: jest.Mock<SubscriberDouble, [string, Listener]>;
    subscribe: jest.Mock<Promise<void>, [string]>;
    unsubscribe: jest.Mock<Promise<void>, [string]>;
    psubscribe: jest.Mock<Promise<void>, [string]>;
    quit: jest.Mock<Promise<void>, []>;
};
type PublisherDouble = {
    on: jest.Mock<PublisherDouble, [string, Listener]>;
    publish: jest.Mock<Promise<number>, [string, string]>;
    quit: jest.Mock<Promise<void>, []>;
};
type RedisDoubleFactory = {
    listeners: Map<string, Listener[]>;
    subscriber: SubscriberDouble;
    publisher: PublisherDouble;
    nestRedisService: NestRedisService;
};

describe("PubSubService", () => {
    function createRedisDouble(): RedisDoubleFactory {
        const listeners = new Map<string, Listener[]>();
        const subscriber = {} as SubscriberDouble;
        subscriber.on = jest.fn((event: string, listener: Listener) => {
            listeners.set(event, [...(listeners.get(event) ?? []), listener]);
            return subscriber;
        });
        subscriber.subscribe = jest.fn((_channel: string) => Promise.resolve());
        subscriber.unsubscribe = jest.fn((_channel: string) => Promise.resolve());
        subscriber.psubscribe = jest.fn((_pattern: string) => Promise.resolve());
        subscriber.quit = jest.fn(() => Promise.resolve());

        const publisher = {} as PublisherDouble;
        publisher.on = jest.fn((_: string, __: Listener) => publisher);
        publisher.publish = jest.fn((_channel: string, _message: string) => Promise.resolve(1));
        publisher.quit = jest.fn(() => Promise.resolve());

        let duplicateCalls = 0;
        const baseRedis = {
            duplicate: jest.fn(() => {
                duplicateCalls += 1;
                return duplicateCalls === 1 ? publisher : subscriber;
            })
        };

        return {
            listeners,
            subscriber,
            publisher,
            nestRedisService: {
                getOrThrow: jest.fn(() => baseRedis)
            } as unknown as NestRedisService
        };
    }

    it("subscribes to a channel once and fans out to all handlers", async () => {
        const { nestRedisService, subscriber, listeners } = createRedisDouble();
        const service = new PubSubService(nestRedisService);
        const handlerA = jest.fn();
        const handlerB = jest.fn();

        await service.subscribe("ch1", handlerA);
        await service.subscribe("ch1", handlerB);

        expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
        const messageListeners = listeners.get("message") ?? [];
        expect(messageListeners).toHaveLength(1);

        messageListeners[0]("ch1", JSON.stringify({ ok: true }));

        expect(handlerA).toHaveBeenCalledWith({ ok: true }, "ch1");
        expect(handlerB).toHaveBeenCalledWith({ ok: true }, "ch1");
    });

    it("drops invalid JSON channel payloads and logs the parse error", async () => {
        const { nestRedisService, listeners } = createRedisDouble();
        const service = new PubSubService(nestRedisService);
        const handler = jest.fn();
        const loggerErrorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation();

        await service.subscribe("ch1", handler);

        (listeners.get("message") ?? [])[0]?.("ch1", "{bad json");

        expect(handler).not.toHaveBeenCalled();
        expect(loggerErrorSpy).toHaveBeenCalledWith('Redis channel payload parse error for "ch1"', expect.any(SyntaxError));
        loggerErrorSpy.mockRestore();
    });

    it("pattern-subscribes once and fans out to all handlers", async () => {
        const { nestRedisService, subscriber, listeners } = createRedisDouble();
        const service = new PubSubService(nestRedisService);
        const handlerA = jest.fn();
        const handlerB = jest.fn();

        await service.psubscribe("trade:*", handlerA);
        await service.psubscribe("trade:*", handlerB);

        expect(subscriber.psubscribe).toHaveBeenCalledTimes(1);
        const patternListeners = listeners.get("pmessage") ?? [];
        expect(patternListeners).toHaveLength(1);

        patternListeners[0]("trade:*", "trade:1", JSON.stringify({ ok: true }));

        expect(handlerA).toHaveBeenCalledWith({ ok: true }, "trade:1");
        expect(handlerB).toHaveBeenCalledWith({ ok: true }, "trade:1");
    });

    it("does not throw for unregistered message deliveries", async () => {
        const { nestRedisService, listeners } = createRedisDouble();
        const service = new PubSubService(nestRedisService);

        await service.subscribe("ch1", jest.fn());

        expect(() => {
            (listeners.get("message") ?? [])[0]?.("ch2", "hello");
            (listeners.get("pmessage") ?? [])[0]?.("other:*", "ch2", "hello");
        }).not.toThrow();
    });

    it("preserves nullable redis defense", async () => {
        const loggerWarnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation();
        const service = new PubSubService({
            getOrThrow: jest.fn(() => {
                throw new Error("no redis");
            })
        } as unknown as NestRedisService);

        await expect(service.subscribe("ch1", jest.fn())).resolves.toBeUndefined();
        await expect(service.psubscribe("trade:*", jest.fn())).resolves.toBeUndefined();
        await expect(service.publish("ch1", { ok: true })).resolves.toBe(0);
        expect(loggerWarnSpy).toHaveBeenCalled();
        loggerWarnSpy.mockRestore();
    });
});

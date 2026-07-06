import type { Repository } from "typeorm";
import { REDIS_CHANNELS } from "../../../redis/channels";
import type { PriceUpdateEvent } from "../../tokens/types/holder-aggregation.types";
import type { MarketPriceEvent } from "../entities/market-price-event.entity";
import { MarketPriceUpdateHandler } from "./market-price-update.handler";

describe("MarketPriceUpdateHandler", () => {
    let handler: MarketPriceUpdateHandler;
    let priceEventRepository: {
        create: jest.Mock;
        createQueryBuilder: jest.Mock;
    };
    let execute: jest.Mock;

    const event: PriceUpdateEvent = {
        network: "devnet",
        mint: "mint-1",
        price_usd: 12.5,
        price_native: 0.2,
        slot: 123,
        source: "indexer-price-update"
    };

    beforeEach(() => {
        execute = jest.fn().mockResolvedValue(undefined);
        priceEventRepository = {
            create: jest.fn((value) => value),
            createQueryBuilder: jest.fn(() => ({
                insert: jest.fn().mockReturnThis(),
                into: jest.fn().mockReturnThis(),
                values: jest.fn().mockReturnThis(),
                execute
            }))
        };

        handler = new MarketPriceUpdateHandler(priceEventRepository as unknown as Repository<MarketPriceEvent>);
    });

    it("persists a valid dedicated price update as a market-price event", async () => {
        jest.spyOn(Date, "now").mockReturnValue(1_720_000_000_000);

        await handler.handle(event, REDIS_CHANNELS.PRICE_UPDATES("devnet"));

        expect(priceEventRepository.create).toHaveBeenCalledWith({
            tokenMint: "mint-1",
            network: "devnet",
            price: 12.5,
            slot: "123",
            timestamp: "1720000000",
            source: "indexer-price-update",
            eventType: "PRICE_UPDATE"
        });
        expect(execute).toHaveBeenCalledTimes(1);
    });

    it("does not persist invalid price updates", async () => {
        await handler.handle({ ...event, price_usd: 0 }, REDIS_CHANNELS.PRICE_UPDATES("devnet"));

        expect(priceEventRepository.create).not.toHaveBeenCalled();
        expect(execute).not.toHaveBeenCalled();
    });
});

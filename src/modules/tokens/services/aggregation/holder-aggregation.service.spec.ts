import { Logger } from "@nestjs/common";
import type { Repository } from "typeorm";
import type { Holder } from "../../entities/holder.entity";
import type { RedisService } from "../../../../redis/services/redis.service";
import type { TokenPriceService } from "../token-price.service";
import type { JupiterService } from "../../../../infra/jupiter/jupiter.service";
import type { PriceUpdateEvent } from "../../types/holder-aggregation.types";
import { HolderAggregationService } from "./holder-aggregation.service";

describe("HolderAggregationService", () => {
    let service: HolderAggregationService;
    let redisClient: {
        zrevrange: jest.Mock;
        hgetall: jest.Mock;
        hset: jest.Mock;
    };
    let redisService: Pick<RedisService, "getClient">;
    let tokenPriceService: Pick<TokenPriceService, "setPrice" | "getPrice">;

    const event: PriceUpdateEvent = {
        network: "mainnet",
        mint: "mint-1",
        price_usd: 12,
        price_native: 0.25,
        slot: 123,
        source: "indexer-price-update"
    };

    beforeEach(() => {
        redisClient = {
            zrevrange: jest.fn().mockResolvedValue(["wallet-1"]),
            hgetall: jest.fn().mockResolvedValue({
                balance: "5",
                cost_basis: "10"
            }),
            hset: jest.fn().mockResolvedValue(1)
        };

        redisService = {
            getClient: jest.fn().mockReturnValue(redisClient)
        };

        tokenPriceService = {
            setPrice: jest.fn().mockResolvedValue(true),
            getPrice: jest.fn().mockResolvedValue({
                priceUsd: 20,
                priceChange24h: 0,
                source: "redis"
            })
        };

        service = new HolderAggregationService(
            redisService as RedisService,
            tokenPriceService as TokenPriceService,
            {} as JupiterService,
            {} as Repository<Holder>
        );
    });

    it("ignores stale slot events that lost the latest-price write race", async () => {
        jest.spyOn(Logger.prototype, "log").mockImplementation();
        (tokenPriceService.setPrice as jest.Mock).mockResolvedValueOnce(false);

        await service.onPriceUpdate(event);

        expect(tokenPriceService.setPrice).toHaveBeenCalledWith({
            cluster: "mainnet",
            mint: "mint-1",
            priceUsd: 12,
            priceNative: 0.25,
            slot: 123,
            source: "indexer-price-update"
        });
        expect(tokenPriceService.getPrice).not.toHaveBeenCalled();
        expect(redisClient.zrevrange).not.toHaveBeenCalled();
        expect(redisClient.hset).not.toHaveBeenCalled();
        expect(Logger.prototype.log).not.toHaveBeenCalled();
    });

    it("recalculates holder PnL from the committed latest price", async () => {
        const loggerLogSpy = jest.spyOn(Logger.prototype, "log").mockImplementation();

        await service.onPriceUpdate(event);

        expect(tokenPriceService.getPrice).toHaveBeenCalledWith("mainnet", "mint-1");
        expect(redisClient.hset).toHaveBeenCalledWith("holder:mainnet:mint-1:wallet-1", "unrealized_pnl", 90);
        expect(loggerLogSpy).toHaveBeenCalledWith("Updated price for token: mint-1, price=20");
    });
});

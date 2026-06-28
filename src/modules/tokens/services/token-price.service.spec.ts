import { TokenPriceService } from "./token-price.service";
import type { Token } from "../entities/token.entity";
import type { Repository } from "typeorm";
import type { CoinGeckoService } from "src/infra/coingecko/coingecko.service";
import type { RedisService } from "src/redis";

describe("TokenPriceService", () => {
    let service: TokenPriceService;
    let redisClient: { hset: jest.Mock; expire: jest.Mock };
    let redisService: Pick<RedisService, "getClient" | "hgetall" | "ttl">;

    beforeEach(() => {
        redisClient = {
            hset: jest.fn().mockResolvedValue(4),
            expire: jest.fn().mockResolvedValue(1)
        };

        redisService = {
            getClient: jest.fn().mockReturnValue(redisClient),
            hgetall: jest.fn(),
            ttl: jest.fn()
        };

        service = new TokenPriceService({} as Repository<Token>, redisService as RedisService, {} as CoinGeckoService);
    });

    it("writes valid prices to Redis and renews the TTL", async () => {
        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: 12.34,
                priceNative: 0.056,
                slot: 123,
                source: "test"
            })
        ).resolves.toBe(true);

        expect(redisClient.hset).toHaveBeenCalledWith("price:mainnet:mint-1:latest", {
            price_usd: 12.34,
            price_native: 0.056,
            slot: 123,
            source: "test"
        });
        expect(redisClient.expire).toHaveBeenCalledWith("price:mainnet:mint-1:latest", TokenPriceService.PRICE_TTL_S);
    });

    it("rejects non-positive or non-finite prices at the boundary", async () => {
        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: 0,
                priceNative: 0.056,
                slot: 123,
                source: "test"
            })
        ).resolves.toBe(false);

        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: Number.NaN,
                priceNative: 0.056,
                slot: 123,
                source: "test"
            })
        ).resolves.toBe(false);

        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: 12.34,
                priceNative: -1,
                slot: 123,
                source: "test"
            })
        ).resolves.toBe(false);

        expect(redisClient.hset).not.toHaveBeenCalled();
        expect(redisClient.expire).not.toHaveBeenCalled();
    });

    it("returns the number of successful writes for bulk updates", async () => {
        redisClient.hset.mockRejectedValueOnce(new Error("boom"));

        await expect(
            service.setPrices([
                {
                    cluster: "mainnet",
                    mint: "mint-1",
                    priceUsd: 1,
                    priceNative: 0.1,
                    slot: 1,
                    source: "test"
                },
                {
                    cluster: "mainnet",
                    mint: "mint-2",
                    priceUsd: 2,
                    priceNative: 0.2,
                    slot: 2,
                    source: "test"
                },
                {
                    cluster: "mainnet",
                    mint: "mint-3",
                    priceUsd: 0,
                    priceNative: 0.3,
                    slot: 3,
                    source: "test"
                }
            ])
        ).resolves.toBe(1);
    });
});

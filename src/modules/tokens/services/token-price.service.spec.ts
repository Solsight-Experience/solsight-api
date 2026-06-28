import { TokenPriceService } from "./token-price.service";
import type { Token } from "../entities/token.entity";
import type { Repository } from "typeorm";
import type { CoinGeckoService } from "src/infra/coingecko/coingecko.service";
import type { RedisService } from "src/redis";

describe("TokenPriceService", () => {
    let service: TokenPriceService;
    let redisClient: { eval: jest.Mock };
    let redisService: Pick<RedisService, "getClient" | "hgetall" | "ttl">;

    beforeEach(() => {
        redisClient = {
            eval: jest.fn().mockResolvedValue(1)
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

        expect(redisClient.eval).toHaveBeenCalledWith(
            expect.any(String),
            1,
            "price:mainnet:mint-1:latest",
            "123",
            String(TokenPriceService.PRICE_TTL_S),
            "12.34",
            "0.056",
            "test"
        );
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

        expect(redisClient.eval).not.toHaveBeenCalled();
    });

    it("drops writes when the incoming slot regresses", async () => {
        redisClient.eval.mockResolvedValueOnce(0);

        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: 12.34,
                priceNative: 0.056,
                slot: 122,
                source: "test"
            })
        ).resolves.toBe(false);
    });

    it("returns the number of successful writes for bulk updates", async () => {
        redisClient.eval.mockRejectedValueOnce(new Error("boom"));

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

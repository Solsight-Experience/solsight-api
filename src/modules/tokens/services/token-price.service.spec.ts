import { TokenPriceService } from "./token-price.service";
import type { Token } from "../entities/token.entity";
import type { Repository } from "typeorm";
import type { CoinGeckoService } from "src/infra/coingecko/coingecko.service";
import type { RedisService } from "src/redis";

describe("TokenPriceService", () => {
    let service: TokenPriceService;
    let tokenRepository: Pick<Repository<Token>, "findOne" | "find">;
    let coinGeckoService: Pick<CoinGeckoService, "getSimplePrice">;
    let redisClient: { eval: jest.Mock };
    let redisService: Pick<RedisService, "getClient" | "hgetall" | "ttl">;

    beforeEach(() => {
        tokenRepository = {
            findOne: jest.fn(),
            find: jest.fn()
        };

        coinGeckoService = {
            getSimplePrice: jest.fn()
        };

        redisClient = {
            eval: jest.fn().mockResolvedValue(1)
        };

        redisService = {
            getClient: jest.fn().mockReturnValue(redisClient),
            hgetall: jest.fn(),
            ttl: jest.fn()
        };

        service = new TokenPriceService(tokenRepository as Repository<Token>, redisService as RedisService, coinGeckoService as CoinGeckoService);
    });

    it("writes valid prices to Redis and renews the TTL", async () => {
        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: 12.34,
                priceNative: 0.056,
                slot: 123,
                source: "swap"
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
            "swap"
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
                source: "swap"
            })
        ).resolves.toBe(false);

        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: Number.NaN,
                priceNative: 0.056,
                slot: 123,
                source: "swap"
            })
        ).resolves.toBe(false);

        await expect(
            service.setPrice({
                cluster: "mainnet",
                mint: "mint-1",
                priceUsd: 12.34,
                priceNative: -1,
                slot: 123,
                source: "swap"
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
                source: "swap"
            })
        ).resolves.toBe(false);
    });

    it("returns Redis prices only when the TTL is still fresh", async () => {
        const redisHash = {
            price_usd: "12.34"
        };

        (redisService.hgetall as jest.Mock).mockResolvedValue(redisHash);
        (redisService.ttl as jest.Mock).mockResolvedValue(TokenPriceService.FRESH_MIN_TTL_S);

        await expect(service.getPrice("mainnet", "mint-1")).resolves.toEqual({
            priceUsd: 12.34,
            priceChange24h: 0,
            source: "redis"
        });
    });

    it("falls back when the Redis TTL is below the freshness floor", async () => {
        (redisService.hgetall as jest.Mock).mockResolvedValue({
            price_usd: "12.34"
        });
        (redisService.ttl as jest.Mock).mockResolvedValue(TokenPriceService.FRESH_MIN_TTL_S - 1);
        (tokenRepository.findOne as jest.Mock).mockResolvedValue({
            price: 99,
            priceChange24h: 3.5
        });

        await expect(service.getPrice("mainnet", "mint-1")).resolves.toEqual({
            priceUsd: 99,
            priceChange24h: 3.5,
            source: "db"
        });
        expect(redisClient.eval).toHaveBeenCalledWith(
            expect.any(String),
            1,
            "price:mainnet:mint-1:latest",
            String(TokenPriceService.FRESH_MIN_TTL_S),
            String(TokenPriceService.PRICE_TTL_S),
            "99"
        );
    });

    it("applies the same freshness check in bulk reads", async () => {
        (redisService.hgetall as jest.Mock).mockImplementation(async (key: string) => {
            if (key === "price:mainnet:fresh:latest") {
                return { price_usd: "10" };
            }
            if (key === "price:mainnet:stale:latest") {
                return { price_usd: "20" };
            }
            return null;
        });
        (redisService.ttl as jest.Mock).mockImplementation(async (key: string) => {
            if (key === "price:mainnet:fresh:latest") {
                return TokenPriceService.FRESH_MIN_TTL_S;
            }
            if (key === "price:mainnet:stale:latest") {
                return TokenPriceService.FRESH_MIN_TTL_S - 1;
            }
            return -2;
        });
        (tokenRepository.find as jest.Mock).mockResolvedValue([
            {
                address: "stale",
                price: 55,
                priceChange24h: 1.5,
                coingeckoId: null
            }
        ]);

        await expect(service.getPrices("mainnet", ["fresh", "stale"])).resolves.toEqual(
            new Map([
                [
                    "fresh",
                    {
                        priceUsd: 10,
                        priceChange24h: 0,
                        source: "redis"
                    }
                ],
                [
                    "stale",
                    {
                        priceUsd: 55,
                        priceChange24h: 1.5,
                        source: "db"
                    }
                ]
            ])
        );
        expect(redisClient.eval).toHaveBeenCalledWith(
            expect.any(String),
            1,
            "price:mainnet:stale:latest",
            String(TokenPriceService.FRESH_MIN_TTL_S),
            String(TokenPriceService.PRICE_TTL_S),
            "55"
        );
    });

    it("still returns the DB fallback when Redis rehydration fails", async () => {
        (redisService.hgetall as jest.Mock).mockResolvedValue(null);
        (redisService.ttl as jest.Mock).mockResolvedValue(-2);
        (tokenRepository.findOne as jest.Mock).mockResolvedValue({
            price: 42,
            priceChange24h: 0
        });
        redisClient.eval.mockRejectedValueOnce(new Error("redis unavailable"));

        await expect(service.getPrice("devnet", "mint-1")).resolves.toEqual({
            priceUsd: 42,
            priceChange24h: 0,
            source: "db"
        });
    });
});

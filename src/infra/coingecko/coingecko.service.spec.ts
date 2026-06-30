import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import type { Cache } from "cache-manager";
import { CoinGeckoService } from "./coingecko.service";

describe("CoinGeckoService cluster guard", () => {
    it("rejects devnet before reading cache or calling CoinGecko", async () => {
        const config = {
            get: jest.fn((key: string) => (key === "coingecko.apiUrl" ? "https://coingecko.test" : "test-key"))
        } as unknown as ConfigService;
        const cache = {
            get: jest.fn(),
            set: jest.fn(),
            del: jest.fn()
        } as unknown as Cache;
        const service = new CoinGeckoService(config, cache);

        await expect(service.getSimplePrice("devnet", ["solana"])).rejects.toBeInstanceOf(ServiceUnavailableException);
        expect(cache.get).not.toHaveBeenCalled();
    });
});

import { ServiceUnavailableException } from "@nestjs/common";
import type { ConfigService } from "@nestjs/config";
import { JupiterService } from "./jupiter.service";

describe("JupiterService cluster guard", () => {
    it("rejects devnet before executing Jupiter functionality", async () => {
        const config = {
            get: jest.fn((key: string) => (key === "jupiter.apiUrl" ? "https://jupiter.test" : "test-key"))
        } as unknown as ConfigService;
        const service = new JupiterService(config);

        await expect(service.getTokenPrices("devnet", [])).rejects.toBeInstanceOf(ServiceUnavailableException);
    });
});

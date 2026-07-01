import type { ConfigService } from "@nestjs/config";
import type { KoraService } from "../kora/kora.service";
import { ExecutorCapability } from "../executor/interfaces/executor-capabilities.interface";
import { SolsightExecutorService } from "./solsight-executor.service";

function createConfigService(): ConfigService {
    return {
        get: jest.fn((key: string) => {
            if (key === "solsightExecutor.apiUrl") return "http://localhost:8080";
            if (key === "solsightExecutor.apiKey") return "api-key";
            return undefined;
        })
    } as unknown as ConfigService;
}

describe("SolsightExecutorService", () => {
    it("reports gasless capabilities from Kora", async () => {
        const service = new SolsightExecutorService(createConfigService(), {
            isEnabled: jest.fn().mockReturnValue(true),
            getSupportedTokens: jest.fn().mockResolvedValue(["FeeMint"]),
            getPayerPubkey: jest.fn().mockResolvedValue("PayerPubkey")
        } as unknown as KoraService);

        await expect(service.getCapabilities()).resolves.toEqual({
            executorKey: "solsight",
            capabilities: [ExecutorCapability.Gasless],
            gaslessSupportedTokens: ["FeeMint"],
            payerPubkey: "PayerPubkey"
        });
    });

    it("reports no gasless capability when Kora is disabled", async () => {
        const service = new SolsightExecutorService(createConfigService(), {
            isEnabled: jest.fn().mockReturnValue(false)
        } as unknown as KoraService);

        await expect(service.getCapabilities()).resolves.toEqual({
            executorKey: "solsight",
            capabilities: [],
            gaslessSupportedTokens: [],
            payerPubkey: null
        });
    });

    it("fails closed when Kora capability metadata cannot be loaded", async () => {
        const service = new SolsightExecutorService(createConfigService(), {
            isEnabled: jest.fn().mockReturnValue(true),
            getSupportedTokens: jest.fn().mockRejectedValue(new Error("Kora unavailable")),
            getPayerPubkey: jest.fn().mockResolvedValue("PayerPubkey")
        } as unknown as KoraService);

        await expect(service.getCapabilities()).resolves.toEqual({
            executorKey: "solsight",
            capabilities: [],
            gaslessSupportedTokens: [],
            payerPubkey: null
        });
    });
});

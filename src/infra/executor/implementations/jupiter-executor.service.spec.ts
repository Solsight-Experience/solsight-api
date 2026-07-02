import type { JupiterService } from "../../jupiter/jupiter.service";
import { ExecutorCapability } from "../interfaces/executor-capabilities.interface";
import { JupiterExecutorService } from "./jupiter-executor.service";

describe("JupiterExecutorService", () => {
    it("reports MEV protection without gasless metadata", async () => {
        const service = new JupiterExecutorService({} as JupiterService);

        await expect(service.getCapabilities()).resolves.toEqual({
            executorKey: "jupiter",
            capabilities: [ExecutorCapability.MevProtection],
            gaslessSupportedTokens: [],
            payerPubkey: null
        });
    });
});

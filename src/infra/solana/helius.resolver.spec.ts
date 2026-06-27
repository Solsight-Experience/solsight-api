import type { HeliusService } from "./helius.service";
import { HeliusResolver } from "./helius.resolver";

describe("HeliusResolver", () => {
    it("selects the explicitly requested Helius instance", () => {
        const mainnet = { network: "mainnet" } as unknown as HeliusService;
        const devnet = { network: "devnet" } as unknown as HeliusService;
        const resolver = new HeliusResolver(mainnet, devnet);

        expect(resolver.forCluster("mainnet")).toBe(mainnet);
        expect(resolver.forCluster("devnet")).toBe(devnet);
    });
});

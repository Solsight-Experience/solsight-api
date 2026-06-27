import { RoomFactory } from "./room.factory";

describe("RoomFactory", () => {
    it("keeps mainnet and devnet subscriptions in distinct rooms", () => {
        const mainnet = RoomFactory.create({ cluster: "mainnet", domain: "holders", resource: "mint", interval: "5s" });
        const devnet = RoomFactory.create({ cluster: "devnet", domain: "holders", resource: "mint", interval: "5s" });

        expect(mainnet).toBe("holders:mainnet:mint:5s");
        expect(devnet).toBe("holders:devnet:mint:5s");
        expect(mainnet).not.toBe(devnet);
    });

    it("rejects subscriptions without an explicit supported cluster", () => {
        expect(() => RoomFactory.create({ domain: "holders", resource: "mint", interval: "5s" } as never)).toThrow("Invalid cluster");
    });
});

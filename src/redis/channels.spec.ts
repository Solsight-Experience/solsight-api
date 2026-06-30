import { REDIS_CHANNELS, isTradeEventChannel } from "./channels";

describe("isTradeEventChannel", () => {
    it("matches only the known trade event channels", () => {
        expect(isTradeEventChannel(REDIS_CHANNELS.TRADE_EVENTS("mainnet"))).toBe(true);
        expect(isTradeEventChannel(REDIS_CHANNELS.TRADE_EVENTS("devnet"))).toBe(true);
        expect(isTradeEventChannel("solsight:trade_events_v2:mainnet")).toBe(false);
        expect(isTradeEventChannel("solsight:holder_updates:mainnet")).toBe(false);
    });
});

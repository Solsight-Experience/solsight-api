import type { SolsightExecutorService } from "../../solsight-executor/solsight-executor.service";
import type { JupiterExecutorService } from "../implementations/jupiter-executor.service";
import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
    const jupiter = {
        getCapabilities: jest.fn(),
        getQuote: jest.fn(),
        getSwapTransaction: jest.fn()
    } as unknown as JupiterExecutorService;
    const solsight = {
        getCapabilities: jest.fn(),
        getQuote: jest.fn(),
        getSwapTransaction: jest.fn()
    } as unknown as SolsightExecutorService;

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it("routes mainnet to Jupiter", () => {
        const circuitBreaker = new CircuitBreaker(jupiter, solsight);

        expect(circuitBreaker.forCluster("mainnet")).toBe(jupiter);
    });

    it("routes devnet to Solsight Executor", () => {
        const circuitBreaker = new CircuitBreaker(jupiter, solsight);

        expect(circuitBreaker.forCluster("devnet")).toBe(solsight);
    });

    it("does not retain failure state or intercept executor errors", async () => {
        const jupiterMock = jupiter as jest.Mocked<JupiterExecutorService>;
        const upstreamError = new Error("Jupiter unavailable");
        jupiterMock.getQuote.mockRejectedValue(upstreamError);
        const circuitBreaker = new CircuitBreaker(jupiter, solsight);
        const executor = circuitBreaker.forCluster("mainnet");

        await expect(executor.getQuote("mainnet", {} as never)).rejects.toBe(upstreamError);
        await expect(executor.getQuote("mainnet", {} as never)).rejects.toBe(upstreamError);

        expect(jupiterMock.getQuote.mock.calls).toHaveLength(2);
    });
});

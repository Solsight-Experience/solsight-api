import { BadRequestException } from "@nestjs/common";
import { CircuitBreaker } from "../../../infra/executor/circuit-breaker/circuit-breaker";
import { GaslessNotSupportedException } from "../../../infra/executor/exceptions/gasless-not-supported.exception";
import { ExecutorCapability, type ExecutorCapabilities } from "../../../infra/executor/interfaces/executor-capabilities.interface";
import type { ExecutorService } from "../../../infra/executor/interfaces/executor-service.interface";
import type { JitoService } from "../../../infra/jito/jito.service";
import type { KoraService } from "../../../infra/kora/kora.service";
import type { SolanaService } from "../../../infra/solana/solana.service";
import type { RedisService } from "../../../redis/services/redis.service";
import type { TokenPriceService } from "../../tokens/services/token-price.service";
import { SwapService } from "./swap.service";

const mainnetCapabilities: ExecutorCapabilities = {
    executorKey: "jupiter",
    capabilities: [ExecutorCapability.MevProtection],
    gaslessSupportedTokens: [],
    payerPubkey: null
};

const devnetCapabilities: ExecutorCapabilities = {
    executorKey: "solsight",
    capabilities: [ExecutorCapability.Gasless],
    gaslessSupportedTokens: ["FeeMint"],
    payerPubkey: "PayerPubkey"
};

function createExecutor(capabilities: ExecutorCapabilities): jest.Mocked<ExecutorService> {
    return {
        getCapabilities: jest.fn().mockResolvedValue(capabilities),
        getQuote: jest.fn().mockResolvedValue({ routePlan: [] }),
        getSwapTransaction: jest.fn().mockResolvedValue({ swapTransaction: "tx" })
    } as unknown as jest.Mocked<ExecutorService>;
}

function createService(executor: jest.Mocked<ExecutorService>) {
    const circuitBreaker = {
        forCluster: jest.fn().mockReturnValue(executor)
    } as unknown as jest.Mocked<CircuitBreaker>;
    const solanaService = {
        getRecentPrioritizationFees: jest.fn().mockResolvedValue([{ prioritizationFee: 120_000 }]),
        submitAndConfirm: jest.fn().mockResolvedValue({ signature: "signature" }),
        confirmSignature: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<SolanaService>;
    const koraService = {
        signAndSendTransaction: jest.fn().mockResolvedValue({ signature: "kora-signature" })
    } as unknown as jest.Mocked<KoraService>;
    const jitoService = {
        getLandedTip75thPercentileLamports: jest.fn().mockResolvedValue(60_000),
        getAntiMevTipLamports: jest.fn().mockResolvedValue(80_000),
        sendBundle: jest.fn().mockResolvedValue({ signature: "jito-signature", bundleId: "bundle-1", landed: true, status: "Landed" })
    } as unknown as jest.Mocked<JitoService>;
    const redisService = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<RedisService>;
    const service = new SwapService(circuitBreaker, solanaService, koraService, jitoService, redisService, {} as TokenPriceService);

    return { service, circuitBreaker, solanaService, koraService, jitoService, redisService };
}

describe("SwapService", () => {
    it("routes quotes using the explicit request cluster", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service, circuitBreaker } = createService(executor);

        await service.getQuote("mainnet", {
            inputMint: "InputMint",
            outputMint: "OutputMint",
            amount: "100",
            swapMode: "ExactIn",
            slippageBps: 50,
            cluster: "mainnet"
        });

        expect(circuitBreaker.forCluster.mock.calls).toContainEqual(["mainnet"]);
        expect(executor.getQuote.mock.calls[0]?.[0]).toBe("mainnet");
    });

    it("projects executor capabilities into the additive swap-info response", async () => {
        const executor = createExecutor(devnetCapabilities);
        const { service, redisService } = createService(executor);

        await expect(
            service.getSwapInfo("devnet", {
                cluster: "devnet",
                inputMint: "InputMint",
                outputMint: "OutputMint"
            })
        ).resolves.toEqual({
            autoPriorityFeeLamports: 120_000,
            autoTipLamports: 0,
            autoSlippageBps: null,
            maxAutoFeeLamports: 360_000,
            executorKey: "solsight",
            capabilities: [ExecutorCapability.Gasless],
            gaslessEnabled: true,
            gaslessSupportedTokens: ["FeeMint"],
            payerPubkey: "PayerPubkey"
        });

        expect(redisService.set.mock.calls).toContainEqual([
            "swap:info:devnet:fees:v1",
            {
                autoPriorityFeeLamports: 120_000,
                autoTipLamports: 0,
                maxAutoFeeLamports: 360_000
            },
            5
        ]);
    });

    it("rejects gasless transaction builds on Jupiter", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service } = createService(executor);

        await expect(
            service.getSwapTransaction("mainnet", {
                quoteResponse: {} as never,
                userPublicKey: "UserPublicKey",
                gaslessFeeToken: "FeeMint"
            })
        ).rejects.toBeInstanceOf(GaslessNotSupportedException);

        expect(executor.getSwapTransaction.mock.calls).toHaveLength(0);
    });

    it("passes supported gasless fee tokens to Solsight Executor", async () => {
        const executor = createExecutor(devnetCapabilities);
        const { service } = createService(executor);

        await expect(
            service.getSwapTransaction("devnet", {
                quoteResponse: {} as never,
                userPublicKey: "UserPublicKey",
                gaslessFeeToken: "FeeMint"
            })
        ).resolves.toEqual({ swapTransaction: "tx" });

        expect(executor.getSwapTransaction.mock.calls).toContainEqual([
            "devnet",
            {
                quoteResponse: {},
                userPublicKey: "UserPublicKey",
                wrapAndUnwrapSol: true,
                feeToken: "FeeMint"
            }
        ]);
    });

    it("rejects unsupported gasless fee tokens before calling the executor", async () => {
        const executor = createExecutor(devnetCapabilities);
        const { service } = createService(executor);

        await expect(
            service.getSwapTransaction("devnet", {
                quoteResponse: {} as never,
                userPublicKey: "UserPublicKey",
                gaslessFeeToken: "OtherMint"
            })
        ).rejects.toBeInstanceOf(BadRequestException);

        expect(executor.getSwapTransaction.mock.calls).toHaveLength(0);
    });

    it("guards gasless execution with the selected executor capabilities", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service, koraService, solanaService } = createService(executor);

        await expect(service.executeSwap("mainnet", { signedTransaction: "base64tx", gaslessFeeToken: "FeeMint" })).rejects.toBeInstanceOf(
            GaslessNotSupportedException
        );

        expect(koraService.signAndSendTransaction.mock.calls).toHaveLength(0);
        expect(solanaService.confirmSignature.mock.calls).toHaveLength(0);
    });

    it("keeps signed gasless submission on the existing Kora and Solana path", async () => {
        const executor = createExecutor(devnetCapabilities);
        const { service, koraService, solanaService } = createService(executor);

        await expect(service.executeSwap("devnet", { signedTransaction: "base64tx", gaslessFeeToken: "FeeMint" })).resolves.toEqual({
            signature: "kora-signature"
        });

        expect(koraService.signAndSendTransaction.mock.calls).toContainEqual([{ transaction: "base64tx" }]);
        expect(solanaService.confirmSignature.mock.calls).toContainEqual(["devnet", "kora-signature"]);
        expect(executor.getSwapTransaction.mock.calls).toHaveLength(0);
    });

    it("embeds a Jito tip when building an anti-MEV transaction", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service } = createService(executor);

        await service.getSwapTransaction("mainnet", {
            quoteResponse: {} as never,
            userPublicKey: "UserPublicKey",
            antiMevRpc: "sec"
        });

        expect(executor.getSwapTransaction.mock.calls).toContainEqual([
            "mainnet",
            {
                quoteResponse: {},
                userPublicKey: "UserPublicKey",
                wrapAndUnwrapSol: true,
                prioritizationFeeLamports: { jitoTipLamports: 80_000 }
            }
        ]);
    });

    it("does not embed a Jito tip when anti-MEV is off", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service } = createService(executor);

        await service.getSwapTransaction("mainnet", {
            quoteResponse: {} as never,
            userPublicKey: "UserPublicKey",
            antiMevRpc: "off"
        });

        expect(executor.getSwapTransaction.mock.calls).toContainEqual([
            "mainnet",
            {
                quoteResponse: {},
                userPublicKey: "UserPublicKey",
                wrapAndUnwrapSol: true
            }
        ]);
    });

    it("routes anti-MEV execution through the Jito block engine when the bundle lands", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service, jitoService, solanaService } = createService(executor);

        await expect(service.executeSwap("mainnet", { signedTransaction: "base64tx", antiMevRpc: "sec" })).resolves.toEqual({
            signature: "jito-signature"
        });

        expect(jitoService.sendBundle.mock.calls).toContainEqual(["mainnet", "base64tx"]);
        expect(solanaService.submitAndConfirm.mock.calls).toHaveLength(0);
    });

    it("returns an actionable error when the anti-MEV bundle does not land", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service, jitoService } = createService(executor);
        jitoService.sendBundle.mockResolvedValueOnce({ signature: "jito-signature", bundleId: "bundle-1", landed: false, status: "Pending" });

        await expect(service.executeSwap("mainnet", { signedTransaction: "base64tx", antiMevRpc: "sec" })).rejects.toMatchObject({
            status: 502
        });
    });

    it("submits through the default RPC path when no protection is requested", async () => {
        const executor = createExecutor(mainnetCapabilities);
        const { service, jitoService, koraService, solanaService } = createService(executor);

        await expect(service.executeSwap("mainnet", { signedTransaction: "base64tx" })).resolves.toEqual({
            signature: "signature"
        });

        expect(solanaService.submitAndConfirm.mock.calls).toContainEqual(["mainnet", "base64tx"]);
        expect(jitoService.sendBundle.mock.calls).toHaveLength(0);
        expect(koraService.signAndSendTransaction.mock.calls).toHaveLength(0);
    });
});

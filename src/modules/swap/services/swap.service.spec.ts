import { BadRequestException } from "@nestjs/common";
import type { Repository } from "typeorm";
import { CircuitBreaker } from "../../../infra/executor/circuit-breaker/circuit-breaker";
import { GaslessNotSupportedException } from "../../../infra/executor/exceptions/gasless-not-supported.exception";
import { ExecutorCapability, type ExecutorCapabilities } from "../../../infra/executor/interfaces/executor-capabilities.interface";
import type { ExecutorService } from "../../../infra/executor/interfaces/executor-service.interface";
import type { JitoService } from "../../../infra/jito/jito.service";
import type { KoraService } from "../../../infra/kora/kora.service";
import type { SolanaService } from "../../../infra/solana/solana.service";
import type { RedisService } from "../../../redis/services/redis.service";
import type { SwapExecution } from "../../admin-analytics/entities/swap-execution.entity";
import type { TokenPriceService } from "../../tokens/services/token-price.service";
import type { TokensService } from "../../tokens/services/tokens.service";
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
        getLandedTip75thPercentileLamports: jest.fn().mockResolvedValue(60_000)
    } as unknown as jest.Mocked<JitoService>;
    const redisService = {
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(undefined)
    } as unknown as jest.Mocked<RedisService>;
    const service = new SwapService(
        circuitBreaker,
        solanaService,
        koraService,
        jitoService,
        redisService,
        {} as TokenPriceService,
        {} as TokensService,
        { save: jest.fn().mockResolvedValue(undefined) } as unknown as Repository<SwapExecution>
    );

    return { service, circuitBreaker, solanaService, koraService, redisService };
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
});

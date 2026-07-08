import type { Repository } from "typeorm";
import type { CircuitBreaker } from "../../../infra/executor/circuit-breaker/circuit-breaker";
import type { ExecutorService } from "../../../infra/executor/interfaces/executor-service.interface";
import type { OpenAIService } from "../../../infra/openai/openai.service";
import type { DiscoveryService } from "../../discovery/services/discovery.service";
import type { PortfolioService } from "../../portfolio/services/portfolio.service";
import type { TokensService } from "../../tokens/services/tokens.service";
import type { Wallet } from "../../wallets/entities/wallet.entity";
import type { ChatMessage } from "../entities/chat-message.entity";
import type { ChatSession } from "../entities/chat-session.entity";
import type { RagService } from "./rag.service";
import type { QuotaService } from "../../billing/services/quota.service";
import { QuotaExceededException } from "../../billing/exceptions/quota-exceeded.exception";
import type { SendMessagePayload } from "../types/chat.types";
import { ChatService } from "./chat.service";

describe("ChatService executor routing", () => {
    it("uses the explicit cluster when fetching swap price impact", async () => {
        const executor = {
            getQuote: jest.fn().mockResolvedValue({ priceImpactPct: "0.05" })
        } as unknown as jest.Mocked<ExecutorService>;
        const circuitBreaker = {
            forCluster: jest.fn().mockReturnValue(executor)
        } as unknown as jest.Mocked<CircuitBreaker>;
        const tokensService = {
            getTokenMetadata: jest.fn().mockResolvedValue({ decimals: 6 })
        } as unknown as jest.Mocked<TokensService>;
        const repository = {} as Repository<ChatSession>;
        const service = new ChatService(
            tokensService,
            {} as DiscoveryService,
            {} as PortfolioService,
            {} as OpenAIService,
            {} as RagService,
            circuitBreaker,
            {} as QuotaService,
            repository,
            {} as Repository<ChatMessage>,
            {} as Repository<Wallet>
        );
        const fetchPriceImpact = (
            service as unknown as {
                fetchPriceImpact: (cluster: "mainnet" | "devnet", inputMint: string, outputMint: string, amount: number) => Promise<number | null>;
            }
        ).fetchPriceImpact.bind(service);

        await expect(fetchPriceImpact("devnet", "InputMint", "OutputMint", 1)).resolves.toBe(0.05);

        expect(circuitBreaker.forCluster.mock.calls).toContainEqual(["devnet"]);
        expect(executor.getQuote.mock.calls[0]?.[0]).toBe("devnet");
    });
});

function createChatServiceForQuotaTests(quotaService: jest.Mocked<QuotaService>, createCompletion: jest.Mock) {
    const sessionRepo = {
        findOne: jest.fn().mockResolvedValue({ id: "session-1", userId: "user-1" }),
        create: jest.fn((entity) => entity),
        save: jest.fn().mockResolvedValue(undefined)
    } as unknown as Repository<ChatSession>;

    const messageRepo = {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn((entity) => entity),
        save: jest.fn().mockResolvedValue(undefined)
    } as unknown as Repository<ChatMessage>;

    const openaiService = { createCompletion } as unknown as OpenAIService;
    const ragService = { buildContextPrompt: jest.fn().mockResolvedValue(null) } as unknown as RagService;

    return new ChatService(
        {} as TokensService,
        {} as DiscoveryService,
        {} as PortfolioService,
        openaiService,
        ragService,
        {} as CircuitBreaker,
        quotaService,
        sessionRepo,
        messageRepo,
        {} as Repository<Wallet>
    );
}

function basePayload(): SendMessagePayload {
    return {
        cluster: "mainnet",
        message: "hello",
        sessionId: "session-1",
        userId: "user-1",
        walletAddress: "SomeWallet"
    };
}

// Quota chỉ áp dụng cho AI chat: kiểm tra trước khi gọi LLM (tránh tốn chi phí AI
// cho request chắc chắn bị chặn), nhưng chỉ THỰC SỰ trừ quota khi LLM phản hồi
// thành công — không trừ nếu LLM lỗi.
describe("ChatService quota gating", () => {
    it("rejects with QuotaExceededException before calling the LLM when quota is unavailable", async () => {
        const createCompletion = jest.fn();
        const quotaService = {
            hasQuotaAvailable: jest.fn().mockResolvedValue(false),
            consumeQuota: jest.fn()
        } as unknown as jest.Mocked<QuotaService>;
        const service = createChatServiceForQuotaTests(quotaService, createCompletion);

        await expect(service.sendMessage(basePayload())).rejects.toBeInstanceOf(QuotaExceededException);

        expect(createCompletion).not.toHaveBeenCalled();
        expect(quotaService.consumeQuota).not.toHaveBeenCalled();
    });

    it("consumes quota only after the LLM responds successfully", async () => {
        const createCompletion = jest.fn().mockResolvedValue({
            choices: [{ finish_reason: "stop", message: { content: "Hi there" } }]
        });
        const quotaService = {
            hasQuotaAvailable: jest.fn().mockResolvedValue(true),
            consumeQuota: jest.fn().mockResolvedValue({ allowed: true, source: "free" })
        } as unknown as jest.Mocked<QuotaService>;
        const service = createChatServiceForQuotaTests(quotaService, createCompletion);

        const response = await service.sendMessage(basePayload());

        expect(response.type).toBe("text");
        expect(quotaService.consumeQuota).toHaveBeenCalledWith("user-1");
    });

    it("does not consume quota when the LLM call fails", async () => {
        const createCompletion = jest.fn().mockRejectedValue(new Error("LLM down"));
        const quotaService = {
            hasQuotaAvailable: jest.fn().mockResolvedValue(true),
            consumeQuota: jest.fn()
        } as unknown as jest.Mocked<QuotaService>;
        const service = createChatServiceForQuotaTests(quotaService, createCompletion);

        const response = await service.sendMessage(basePayload());

        expect(response.content).toContain("issue");
        expect(quotaService.consumeQuota).not.toHaveBeenCalled();
    });
});

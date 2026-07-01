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

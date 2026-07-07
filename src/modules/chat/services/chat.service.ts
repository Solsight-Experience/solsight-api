import { HttpException, Injectable, Logger } from "@nestjs/common";
import type { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources/chat/completions";
import { OpenAIService } from "../../../infra/openai/openai.service";
import { SortByTrending, TimeFrame } from "../../discovery/dtos/get-trending.dto";
import { DiscoveryService } from "../../discovery/services/discovery.service";
import { PortfolioService } from "../../portfolio/services/portfolio.service";
import { TokensService } from "../../tokens/services/tokens.service";
import { ChatResponsePayload, SendMessagePayload, PageContext } from "../types/chat.types";
import { RagService } from "./rag.service";
import { CircuitBreaker } from "../../../infra/executor/circuit-breaker/circuit-breaker";
import * as fs from "fs";
import * as path from "path";
import type { Cluster } from "../../../common/cluster/cluster.types";

const SYSTEM_PROMPT = fs.readFileSync(path.join(__dirname, "../prompts/system.prompt.md"), "utf-8");

const STATIC_ROUTES = ["/", "/token/[tokenAddress]", "/portfolio", "/multi-chart", "/wallet-tracker", "/notifications"];

const TOKEN_ROUTE_REGEX = /^\/token\/[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LLM_TIMEOUT_MS = 300000;

const RESPONSE_TYPES: ChatResponsePayload["type"][] = [
    "text",
    "token_brief",
    "portfolio_summary",
    "portfolio_activities",
    "portfolio_performance",
    "navigation",
    "trade_intent",
    "slippage_action"
];

/**
 * Classify price impact percentage (decimal fraction, e.g. 0.05 = 5%) into a severity level.
 * Thresholds follow Uniswap / major DEX conventions.
 */
function getPriceImpactSeverity(pct: number | null): "safe" | "warning" | "danger" | "critical" {
    if (pct === null || !Number.isFinite(pct)) return "safe";
    const pctPercent = pct * 100;
    if (pctPercent > 15) return "critical";
    if (pctPercent > 10) return "danger";
    if (pctPercent > 3) return "warning";
    return "safe";
}

function toolLabel(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
        case "fetch_token_data": {
            const address = typeof args.address === "string" ? args.address : "…";
            return `Fetching token data for ${address}`;
        }
        case "search_tokens": {
            const query = typeof args.query === "string" ? args.query : "…";
            return `Searching for "${query}"`;
        }
        case "fetch_discovery":
            return "Fetching discovery list…";
        case "fetch_portfolio":
            return "Fetching portfolio overview…";
        case "fetch_portfolio_activities":
            return "Fetching recent activities…";
        case "fetch_portfolio_performance":
            return "Analyzing portfolio performance…";
        case "prepare_swap":
            return "Preparing swap quote…";
        case "set_slippage": {
            const bps = typeof args.slippageBps === "number" ? args.slippageBps : "…";
            const warnOnly = args.warnOnly === true;
            return warnOnly ? "Checking slippage…" : `Setting slippage to ${bps} bps…`;
        }
        case "navigate_to": {
            const route = typeof args.route === "string" ? args.route : "…";
            return `Navigating to ${route}`;
        }
        default:
            return `Executing ${toolName}…`;
    }
}

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
    {
        type: "function",
        function: {
            name: "fetch_token_data",
            description:
                'Fetch detailed token information including price, market cap, and 24h change. Accepts either a Solana mint address OR a token symbol (e.g. "SOL", "USDC", "BONK"). Symbol resolution is handled automatically — no need to call search_tokens first for well-known or common tokens.',
            parameters: {
                type: "object",
                properties: {
                    address: {
                        type: "string",
                        description:
                            'Solana token mint address OR token symbol (e.g. "SOL", "USDC", "BONK", "JUP"). If a symbol is provided, it will be resolved to the correct mint address automatically.'
                    }
                },
                required: ["address"],
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "search_tokens",
            description: "Search tokens by symbol, name, or address",
            parameters: {
                type: "object",
                properties: {
                    query: {
                        type: "string",
                        description: "Search query for token lookup"
                    },
                    limit: {
                        type: "number",
                        description: "Max number of tokens to return"
                    }
                },
                required: ["query"],
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetch_discovery",
            description: "Fetch discovery list (trending/new tokens) with optional filters",
            parameters: {
                type: "object",
                properties: {
                    category: {
                        type: "string",
                        description: "Discovery category name"
                    },
                    sortBy: {
                        type: "string",
                        description: "Sort field for discovery results"
                    }
                },
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetch_portfolio",
            description: "Fetch user portfolio overview and top allocations",
            parameters: {
                type: "object",
                properties: {
                    userId: {
                        type: "string",
                        description: "Application user id"
                    },
                    walletAddresses: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional wallet addresses filter"
                    }
                },
                required: ["userId"],
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetch_portfolio_activities",
            description:
                "Fetch recent on-chain activities (swaps, transfers, stakes) across the user's wallets. Use this when the user asks about recent transactions, recent activity, or a summary of what happened recently.",
            parameters: {
                type: "object",
                properties: {
                    userId: {
                        type: "string",
                        description: "Application user id"
                    },
                    walletAddress: {
                        type: "string",
                        description: "Optional specific wallet address to filter by"
                    },
                    type: {
                        type: "string",
                        description: "Activity type filter: all, swap, transfer, stake, unstake, token_mint, burn"
                    },
                    limit: {
                        type: "number",
                        description: "Max number of activities to return (default 10)"
                    }
                },
                required: ["userId"],
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "fetch_portfolio_performance",
            description:
                "Fetch trading performance metrics: PnL (profit/loss), ROI, win rate, best and worst trades. Use this when user asks about profit, loss, performance, PnL, ROI, or how well their trading is going.",
            parameters: {
                type: "object",
                properties: {
                    userId: {
                        type: "string",
                        description: "Application user id"
                    },
                    walletAddresses: {
                        type: "array",
                        items: { type: "string" },
                        description: "Optional wallet addresses filter"
                    },
                    timeFrame: {
                        type: "string",
                        description: "Time frame: 7d, 30d, 90d, 1y, all (default 30d)"
                    }
                },
                required: ["userId"],
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "prepare_swap",
            description: "Prepare swap intent object from user input without execution",
            parameters: {
                type: "object",
                properties: {
                    inputMint: {
                        type: "string",
                        description: "Input token mint address"
                    },
                    outputMint: {
                        type: "string",
                        description: "Output token mint address"
                    },
                    amount: {
                        type: "number",
                        description: "Token amount to swap"
                    },
                    slippageBps: {
                        type: "number",
                        description: "Optional slippage in basis points (e.g. 100 for 1%, 50 for 0.5%). Default 50."
                    }
                },
                required: ["inputMint", "outputMint", "amount"],
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "set_slippage",
            description:
                "Set or warn about the slippage tolerance (in basis points) for the trading panel. " +
                "Use when the user asks to change slippage, e.g. 'set slippage to 1%', 'đặt trượt giá 0.5%'. " +
                "1% = 100 bps, 0.5% = 50 bps. Pass warnOnly=true only if the user asks to check or be warned about slippage without changing it.",
            parameters: {
                type: "object",
                properties: {
                    slippageBps: {
                        type: "number",
                        description: "Slippage in basis points. 100 = 1%, 50 = 0.5%, 500 = 5%. Must be between 1 and 5000."
                    },
                    warnOnly: {
                        type: "boolean",
                        description: "If true, only warn the user about slippage level without changing it. Default false."
                    }
                },
                required: ["slippageBps"],
                additionalProperties: false
            }
        }
    },
    {
        type: "function",
        function: {
            name: "navigate_to",
            description: "Return validated frontend route for navigation action",
            parameters: {
                type: "object",
                properties: {
                    route: {
                        type: "string",
                        description: "Frontend route"
                    }
                },
                required: ["route"],
                additionalProperties: false
            }
        }
    }
];

import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ChatSession as ChatSessionEntity } from "../entities/chat-session.entity";
import { ChatMessage as ChatMessageEntity } from "../entities/chat-message.entity";
import { Wallet } from "../../wallets/entities/wallet.entity";
import { COMMON_SYMBOLS } from "src/modules/tokens/constants/token.constant";

@Injectable()
export class ChatService {
    private readonly activeProcessingSessions = new Set<string>();
    private readonly logger = new Logger(ChatService.name);

    constructor(
        private readonly tokensService: TokensService,
        private readonly discoveryService: DiscoveryService,
        private readonly portfolioService: PortfolioService,
        private readonly openaiService: OpenAIService,
        private readonly ragService: RagService,
        private readonly circuitBreaker: CircuitBreaker,
        @InjectRepository(ChatSessionEntity)
        private readonly sessionRepo: Repository<ChatSessionEntity>,
        @InjectRepository(ChatMessageEntity)
        private readonly messageRepo: Repository<ChatMessageEntity>,
        @InjectRepository(Wallet)
        private readonly walletRepo: Repository<Wallet>
    ) {}

    private mapToCompletionMessage(message: ChatMessageEntity): ChatCompletionMessageParam {
        if (message.role === "tool") {
            return {
                role: "tool" as const,
                content: message.content,
                tool_call_id: message.toolCallId || "",
                name: message.toolName
            } as unknown as ChatCompletionMessageParam;
        }

        if (message.role === "assistant") {
            const data = message.data as { toolCalls?: unknown[] } | null | undefined;
            const toolCalls = data?.toolCalls;
            return {
                role: "assistant" as const,
                content: message.content || null,
                ...(toolCalls && toolCalls.length > 0 ? { tool_calls: toolCalls } : {})
            } as unknown as ChatCompletionMessageParam;
        }

        if (message.role === "user") {
            let content = message.content;
            const data = message.data as { pageContext?: PageContext } | null | undefined;
            if (data?.pageContext) {
                const { pathname, tokenAddress } = data.pageContext;
                content = `[Current Page: ${pathname}${tokenAddress ? `, Token Address: ${tokenAddress}` : ""}] ${message.content}`;
            }
            return {
                role: "user" as const,
                content
            } as ChatCompletionMessageParam;
        }

        return {
            role: message.role as "user" | "system",
            content: message.content
        } as ChatCompletionMessageParam;
    }

    /**
     * Sanitize a raw history window into a valid OpenAI message sequence.
     *
     * OpenAI enforces a strict invariant:
     *   Every `tool` message must be preceded (anywhere in the array, not just
     *   immediately) by an `assistant` message whose `tool_calls` array contains
     *   the same `tool_call_id`. If the history window is sliced such that the
     *   assistant-caller is missing, OpenAI returns 400.
     *
     * Strategy — drop complete, atomic tool-call groups from the **oldest** end
     * until the array either:
     *   (a) starts with a `user` message, or
     *   (b) starts with an `assistant` message that has NO tool_calls (plain text).
     *
     * A "tool-call group" is defined as:
     *   [assistant + tool_calls] followed by one or more [tool] messages.
     * Both parts are dropped together so the remainder is always self-consistent.
     */
    private sanitizeHistoryMessages(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
        // Build a set of tool_call_ids that are "claimed" by assistant messages
        // present in the window, so we can detect orphaned tool messages quickly.
        const claimedIds = new Set<string>();
        for (const msg of messages) {
            if (msg.role === "assistant") {
                const toolCalls = (msg as { tool_calls?: { id?: string }[] }).tool_calls;
                if (toolCalls) {
                    for (const tc of toolCalls) {
                        if (tc.id) claimedIds.add(tc.id);
                    }
                }
            }
        }

        // Drop leading orphaned tool messages — their assistant caller was cut off.
        let start = 0;
        while (start < messages.length) {
            const msg = messages[start];
            if (msg.role === "tool") {
                const toolCallId = (msg as { tool_call_id?: string }).tool_call_id ?? "";
                if (!claimedIds.has(toolCallId)) {
                    // Orphaned — skip it and remove from claimed set to stay in sync.
                    start++;
                    continue;
                }
            }
            // First non-orphaned message found.
            break;
        }

        const sanitized = messages.slice(start);

        // After dropping orphaned tool messages the first non-system message must
        // now be a `user` or a plain `assistant` (no tool_calls). If it is still
        // an `assistant` with tool_calls (i.e. the caller is present but the
        // tool-result messages were somehow missing), drop the entire group to
        // avoid an unresolved dangling tool_calls entry.
        while (sanitized.length > 0) {
            const first = sanitized[0];
            if (first.role === "assistant" && (first as { tool_calls?: unknown[] }).tool_calls?.length) {
                // Drop this assistant-caller and all immediately following tool messages.
                sanitized.shift();
                while (sanitized.length > 0 && sanitized[0].role === "tool") {
                    sanitized.shift();
                }
                continue;
            }
            break;
        }

        this.logger.debug(`sanitizeHistoryMessages: window=${messages.length} → sanitized=${sanitized.length}`, ChatService.name);

        return sanitized;
    }

    /**
     * Fetch price impact for a given swap pair via the ExecutorService interface.
     *
     * Delegates to the executor selected for the request cluster.
     * Both return `priceImpactPct` as a decimal-fraction string, e.g. "0.05" = 5%.
     *
     * Returns the raw decimal fraction, or null if the quote cannot be obtained.
     * Never throws — errors are swallowed so prepare_swap continues regardless.
     */
    private async fetchPriceImpact(cluster: Cluster, inputMint: string, outputMint: string, amount: number): Promise<number | null> {
        try {
            if (!inputMint || !outputMint || amount <= 0) return null;

            // Resolve input token decimals via tokensService.
            const meta = await this.tokensService.getTokenMetadata(cluster, inputMint);
            const inputDecimals = meta?.decimals ?? 6;

            const amountBaseUnits = Math.round(amount * Math.pow(10, inputDecimals));
            if (amountBaseUnits <= 0) return null;

            const executor = this.circuitBreaker.forCluster(cluster);
            const quote = await executor.getQuote(cluster, {
                inputMint,
                outputMint,
                amount: String(amountBaseUnits),
                swapMode: "ExactIn",
                slippageBps: 50
            });

            // priceImpactPct is a decimal-fraction string from both Jupiter and
            // solsight-executor, e.g. "0.05" means 5% impact.
            const pct = Number(quote.priceImpactPct);
            return Number.isFinite(pct) ? pct : null;
        } catch {
            // Best-effort: never block the swap flow on a failed quote.
            return null;
        }
    }

    private async getOrCreateSession(sessionId: string, userId?: string, walletAddress?: string): Promise<ChatSessionEntity> {
        let session = await this.sessionRepo.findOne({ where: { id: sessionId } });

        if (session) {
            // Security check: If session has a userId, it must match the current user
            if (session.userId && userId && session.userId !== userId) {
                this.logger.warn(`User ${userId} tried to access session ${sessionId} belonging to ${session.userId}`);
                throw new HttpException("Session access denied", 403);
            }

            // If session was anonymous but now we have a user, attach it (optional, but good for continuity)
            if (!session.userId && userId) {
                session.userId = userId;
                if (!session.walletAddress && walletAddress) {
                    session.walletAddress = walletAddress;
                }
                await this.sessionRepo.save(session);
            }

            return session;
        }

        let resolvedWallet = walletAddress;
        if (!resolvedWallet && userId) {
            const wallet = await this.walletRepo.findOne({
                where: { userId },
                order: { isDefault: "DESC", createdAt: "ASC" }
            });
            if (wallet) {
                resolvedWallet = wallet.address;
            }
        }

        session = this.sessionRepo.create({
            id: sessionId,
            userId: userId || undefined,
            walletAddress: resolvedWallet || undefined
        });
        await this.sessionRepo.save(session);

        return session;
    }

    async sendMessage(payload: SendMessagePayload, onToolProgress: (label: string) => void = () => {}): Promise<ChatResponsePayload> {
        if (this.activeProcessingSessions.has(payload.sessionId)) {
            this.logger.warn(`Session ${payload.sessionId} is already processing a message, rejecting`, ChatService.name);
            throw new HttpException("Already processing a message", 429);
        }

        this.logger.log(
            `Received message for session=${payload.sessionId} wallet=${payload.walletAddress ?? "none"} length=${payload.message.length}`,
            ChatService.name
        );

        this.activeProcessingSessions.add(payload.sessionId);

        await this.getOrCreateSession(payload.sessionId, payload.userId, payload.walletAddress);

        await this.messageRepo.save(
            this.messageRepo.create({
                sessionId: payload.sessionId,
                role: "user",
                content: payload.message,
                data: payload.pageContext ? { pageContext: payload.pageContext } : undefined
            })
        );

        try {
            const response = await this.runLlmLoop(
                payload.cluster,
                payload.sessionId,
                payload.walletAddress,
                payload.userId,
                onToolProgress,
                payload.pageContext
            );
            this.logger.log(`Session ${payload.sessionId} completed: responseType=${response.type}`, ChatService.name);
            return {
                ...response,
                sessionId: payload.sessionId
            };
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown LLM error";
            this.logger.error(`Failed to process chat message: ${message}`, error instanceof Error ? error.stack : undefined, ChatService.name);

            return {
                sessionId: payload.sessionId,
                type: "text",
                content: "I encountered an issue while processing your request. Please try again in a moment."
            };
        } finally {
            this.activeProcessingSessions.delete(payload.sessionId);
        }
    }

    async *sendMessageStream(payload: SendMessagePayload): AsyncGenerator<string, void, unknown> {
        if (this.activeProcessingSessions.has(payload.sessionId)) {
            this.logger.warn(`Session ${payload.sessionId} is already processing a message, rejecting`, ChatService.name);
            throw new HttpException("Already processing a message", 429);
        }

        this.logger.log(
            `Received stream message for session=${payload.sessionId} wallet=${payload.walletAddress ?? "none"} length=${payload.message.length}`,
            ChatService.name
        );

        this.activeProcessingSessions.add(payload.sessionId);

        await this.getOrCreateSession(payload.sessionId, payload.userId, payload.walletAddress);

        await this.messageRepo.save(
            this.messageRepo.create({
                sessionId: payload.sessionId,
                role: "user",
                content: payload.message,
                data: payload.pageContext ? { pageContext: payload.pageContext } : undefined
            })
        );

        try {
            yield* this.runLlmLoopStream(payload.cluster, payload.sessionId, payload.walletAddress, payload.userId);
            this.logger.log(`Session ${payload.sessionId} stream completed`, ChatService.name);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown LLM error";
            this.logger.error(`Failed to process stream message: ${message}`, error instanceof Error ? error.stack : undefined, ChatService.name);
            throw error;
        } finally {
            this.activeProcessingSessions.delete(payload.sessionId);
        }
    }

    async runLlmLoop(
        cluster: Cluster,
        sessionId: string,
        walletAddress?: string,
        userId?: string,
        onToolProgress: (label: string) => void = () => {},
        pageContext?: PageContext
    ): Promise<ChatResponsePayload> {
        // Fetch a wide window so we never accidentally slice through the middle
        // of a tool-call group (assistant caller + tool results). The
        // sanitizeHistoryMessages helper will trim it safely from the oldest end.
        const HISTORY_WINDOW = 50;
        const rawHistory = await this.messageRepo.find({
            where: { sessionId },
            order: { createdAt: "DESC" },
            take: HISTORY_WINDOW
        });
        rawHistory.reverse();

        const messages: ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: SYSTEM_PROMPT
            }
        ];

        // Inject page context
        if (pageContext) {
            const ctx = pageContext;
            const contextParts: string[] = [`User's current page: "${ctx.pathname}".`];
            if (ctx.tokenAddress) contextParts.push(`Viewing token with address: ${ctx.tokenAddress}.`);
            contextParts.push('When the user says "this token", "the token here", or similar vague references, use the token address and symbol above.');
            messages.push({
                role: "system",
                content: contextParts.join(" ")
            });
        }

        // Inject user context (userId and walletAddress)
        const userContextParts: string[] = [];
        if (userId) userContextParts.push(`Current User ID: ${userId}.`);
        if (walletAddress) userContextParts.push(`User's connected wallet: ${walletAddress}.`);
        if (userContextParts.length > 0) {
            messages.push({
                role: "system",
                content: userContextParts.join(" ")
            });
        }

        // Map raw DB entities → OpenAI message params, then sanitize to guarantee
        // no orphaned tool messages reach the API.
        const mappedHistory = rawHistory.map((m) => this.mapToCompletionMessage(m));
        const safeHistory = this.sanitizeHistoryMessages(mappedHistory);

        // Inject RAG context from vector store if available
        const userQuery = safeHistory.findLast((m) => m.role === "user") as { content?: string } | undefined;
        const userQueryText = typeof userQuery?.content === "string" ? userQuery.content : "";
        if (userQueryText) {
            try {
                const ragPrompt = await this.ragService.buildContextPrompt(userQueryText);
                if (ragPrompt) {
                    messages.push({ role: "system", content: ragPrompt });
                    this.logger.debug("RAG context injected into prompt", ChatService.name);
                }
            } catch (error) {
                this.logger.error("Failed to build RAG context", error, ChatService.name);
            }
        }

        messages.push(...safeHistory);

        // Expose sanitized history for parseResponse (replaces old recentMessages reference).
        const recentMessages = rawHistory;

        this.logger.debug(`LLM request: messages=${messages.length}`, ChatService.name);

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            this.logger.warn(`LLM request timed out after ${LLM_TIMEOUT_MS}ms`, ChatService.name);
            controller.abort();
        }, LLM_TIMEOUT_MS);

        try {
            const completion = await this.openaiService.createCompletion(
                {
                    messages,
                    tools: TOOL_DEFINITIONS,
                    tool_choice: "auto",
                    parallel_tool_calls: false,
                    stream: false
                },
                {
                    signal: controller.signal
                }
            );

            const choice = completion.choices[0];
            if (!choice) {
                this.logger.warn("LLM returned no choices", ChatService.name);
                return {
                    sessionId: "",
                    type: "text",
                    content: "No response received from LLM."
                };
            }

            this.logger.debug(`LLM response: finish_reason=${choice.finish_reason}`, ChatService.name);

            if (choice.finish_reason === "tool_calls") {
                const assistantMessage = choice.message;
                await this.messageRepo.save(
                    this.messageRepo.create({
                        sessionId,
                        role: "assistant",
                        content: assistantMessage.content || "",
                        data: {
                            toolCalls: assistantMessage.tool_calls
                        }
                    })
                );

                const toolCalls = assistantMessage.tool_calls || [];
                for (const toolCall of toolCalls) {
                    if (toolCall.type !== "function") {
                        continue;
                    }

                    const toolName = toolCall.function.name;
                    let args: Record<string, unknown> = {};

                    try {
                        args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
                    } catch {
                        this.logger.warn(`Invalid tool arguments for ${toolName}: ${toolCall.function.arguments}`, ChatService.name);
                    }

                    this.logger.log(`Executing tool: ${toolName} args=${JSON.stringify(args)}`, ChatService.name);

                    onToolProgress(toolLabel(toolName, args));

                    const result = await this.executeTool(cluster, toolName, args, walletAddress, userId);

                    this.logger.debug(`Tool ${toolName} result length=${result.length}`, ChatService.name);

                    await this.messageRepo.save(
                        this.messageRepo.create({
                            sessionId,
                            role: "tool",
                            content: result,
                            toolCallId: toolCall.id,
                            toolName
                        })
                    );
                }

                return this.runLlmLoop(cluster, sessionId, walletAddress, userId, onToolProgress, pageContext);
            }

            const assistantContent = choice.message.content || "";
            const parsedResponse = this.parseResponse(assistantContent, recentMessages);

            await this.messageRepo.save(
                this.messageRepo.create({
                    sessionId,
                    role: "assistant",
                    content: assistantContent,
                    type: parsedResponse.type,
                    data: parsedResponse.data
                })
            );

            this.logger.debug(`LLM assistant raw content preview=${assistantContent.slice(0, 200)}`, ChatService.name);
            this.logger.log(`LLM response parsed as type=${parsedResponse.type}`, ChatService.name);

            return parsedResponse;
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown LLM error";
            this.logger.error(`OpenAI chat completion failed: ${message}`, error instanceof Error ? error.stack : undefined, ChatService.name);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    async *runLlmLoopStream(cluster: Cluster, sessionId: string, walletAddress?: string, userId?: string): AsyncGenerator<string, void, unknown> {
        const HISTORY_WINDOW = 50;
        const rawHistory = await this.messageRepo.find({
            where: { sessionId },
            order: { createdAt: "DESC" },
            take: HISTORY_WINDOW
        });
        rawHistory.reverse();

        const mappedHistory = rawHistory.map((m) => this.mapToCompletionMessage(m));
        const safeHistory = this.sanitizeHistoryMessages(mappedHistory);

        const messages: ChatCompletionMessageParam[] = [
            {
                role: "system",
                content: SYSTEM_PROMPT
            },
            // Inject user context (userId and walletAddress)
            ...(userId || walletAddress
                ? [
                      {
                          role: "system" as const,
                          content: `${userId ? `Current User ID: ${userId}. ` : ""}${walletAddress ? `User's connected wallet: ${walletAddress}.` : ""}`
                      }
                  ]
                : []),
            ...safeHistory
        ];

        this.logger.debug(`LLM stream request: messages=${messages.length}`, ChatService.name);

        const controller = new AbortController();
        const timeout = setTimeout(() => {
            this.logger.warn(`LLM stream request timed out after ${LLM_TIMEOUT_MS}ms`, ChatService.name);
            controller.abort();
        }, LLM_TIMEOUT_MS);

        let finalContent = "";
        const toolCallsAccumulator: {
            id?: string;
            type?: string;
            function: { name: string; arguments: string };
            extra_content?: unknown;
        }[] = [];

        try {
            const stream = await this.openaiService.createCompletion(
                {
                    messages,
                    tools: TOOL_DEFINITIONS,
                    tool_choice: "auto",
                    parallel_tool_calls: false,
                    stream: true
                },
                {
                    signal: controller.signal
                }
            );

            for await (const chunk of stream) {
                const choice = chunk.choices[0];
                if (!choice) continue;
                const delta = choice.delta;
                if (delta.content) {
                    finalContent += delta.content;
                    yield delta.content;
                }
                if (delta.tool_calls) {
                    for (const toolCall of delta.tool_calls) {
                        const index = toolCall.index;
                        if (index === undefined) continue;

                        if (!toolCallsAccumulator[index]) {
                            toolCallsAccumulator[index] = {
                                function: { name: "", arguments: "" }
                            };
                        }

                        const acc = toolCallsAccumulator[index];
                        if (toolCall.id) acc.id = toolCall.id;
                        if (toolCall.type) acc.type = toolCall.type;
                        if (toolCall.function?.name) acc.function.name = toolCall.function.name;
                        if (toolCall.function?.arguments) acc.function.arguments += toolCall.function.arguments;
                        const extraContent = (toolCall as unknown as Record<string, unknown>).extra_content;
                        if (extraContent !== undefined) {
                            acc.extra_content = extraContent;
                        }
                    }
                }
                if (choice.finish_reason === "tool_calls") {
                    const toolCalls = toolCallsAccumulator
                        .filter((tc) => tc.id)
                        .map((tc) => ({
                            id: tc.id!,
                            type: tc.type || "function",
                            function: {
                                name: tc.function.name,
                                arguments: tc.function.arguments
                            },
                            ...(tc.extra_content ? { extra_content: tc.extra_content } : {})
                        }));

                    await this.messageRepo.save(
                        this.messageRepo.create({
                            sessionId,
                            role: "assistant",
                            content: "",
                            data: {
                                toolCalls
                            }
                        })
                    );

                    for (const toolCall of toolCalls) {
                        const toolName = toolCall.function.name;
                        let args: Record<string, unknown> = {};
                        try {
                            args = JSON.parse(toolCall.function.arguments || "{}") as Record<string, unknown>;
                        } catch {
                            this.logger.warn(`Invalid tool arguments for ${toolName}: ${toolCall.function.arguments}`, ChatService.name);
                        }

                        this.logger.log(`Executing tool (stream): ${toolName} args=${JSON.stringify(args)}`, ChatService.name);

                        const result = await this.executeTool(cluster, toolName, args, walletAddress, userId);
                        await this.messageRepo.save(
                            this.messageRepo.create({
                                sessionId,
                                role: "tool",
                                content: result,
                                toolCallId: toolCall.id,
                                toolName
                            })
                        );
                    }
                    yield* this.runLlmLoopStream(cluster, sessionId, walletAddress, userId);
                    return;
                }
                if (choice.finish_reason === "stop") {
                    await this.messageRepo.save(
                        this.messageRepo.create({
                            sessionId,
                            role: "assistant",
                            content: finalContent
                        })
                    );
                    return;
                }
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown LLM error";
            this.logger.error(`OpenAI chat stream failed: ${message}`, error instanceof Error ? error.stack : undefined, ChatService.name);
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    async executeTool(cluster: Cluster, toolName: string, args: Record<string, unknown>, walletAddress?: string, userId?: string): Promise<string> {
        try {
            switch (toolName) {
                case "fetch_token_data": {
                    let address = this.getStringArg(args, "address");

                    const isAddress = (str: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);

                    // Resolve symbol → mint address (same logic as prepare_swap)
                    if (address && !isAddress(address)) {
                        const upper = address.toUpperCase();
                        if (COMMON_SYMBOLS[upper]) {
                            address = COMMON_SYMBOLS[upper];
                        } else {
                            const searchResult = await this.tokensService.search(cluster, address, 1);
                            if (searchResult && searchResult.length > 0) {
                                address = searchResult[0].address;
                            }
                        }
                    }

                    const data = await this.tokensService.findOne(cluster, address);
                    return JSON.stringify(data);
                }

                case "search_tokens": {
                    const query = this.getStringArg(args, "query");
                    const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? args.limit : 5;

                    try {
                        const filterResult = await this.tokensService.search(cluster, query, limit);

                        return JSON.stringify(filterResult);
                    } catch {
                        const searchResult = await this.tokensService.search(cluster, query, limit);
                        return JSON.stringify(searchResult);
                    }
                }

                case "fetch_discovery": {
                    const category = typeof args.category === "string" ? args.category : undefined;
                    const sortBy = typeof args.sortBy === "string" ? args.sortBy : undefined;

                    const getTokens = (
                        this.discoveryService as unknown as {
                            getTokens?: (payload: { category?: string; sortBy?: string }) => Promise<unknown>;
                        }
                    ).getTokens;

                    if (getTokens) {
                        const result = await getTokens({ category, sortBy });
                        return JSON.stringify(result);
                    }

                    const fallback = await this.discoveryService.getTrending(cluster, {
                        cluster,
                        sort_by: (sortBy as SortByTrending | undefined) || SortByTrending.VOLUME_24H,
                        time_frame: TimeFrame.TWENTY_FOUR_HOURS,
                        limit: 5,
                        offset: 0
                    });

                    return JSON.stringify({
                        warning: "getTokens not available on DiscoveryService, returned trending fallback",
                        category,
                        data: fallback
                    });
                }

                case "fetch_portfolio": {
                    const resolvedUserId = userId || this.getStringArg(args, "userId");

                    if (!resolvedUserId) {
                        this.logger.warn("fetch_portfolio called without userId", ChatService.name);
                        return JSON.stringify({
                            error: "User ID required — please log in"
                        });
                    }

                    const walletAddresses = Array.isArray(args.walletAddresses)
                        ? args.walletAddresses.filter((value): value is string => typeof value === "string")
                        : undefined;

                    const data = await this.portfolioService.getOverview(cluster, resolvedUserId, walletAddresses);
                    return JSON.stringify(data);
                }

                case "fetch_portfolio_activities": {
                    const resolvedUserId = userId || this.getStringArg(args, "userId");
                    if (!resolvedUserId) {
                        this.logger.warn("fetch_portfolio_activities called without userId", ChatService.name);
                        return JSON.stringify({ error: "User ID required — please log in" });
                    }

                    const walletFilter = this.getStringArg(args, "walletAddress") || walletAddress;
                    const activityType = this.getStringArg(args, "type") || "all";

                    const rawLimit = args.limit;
                    const limit = typeof rawLimit === "number" && Number.isInteger(rawLimit) ? Math.max(1, Math.min(rawLimit, 20)) : 10;

                    const data = await this.portfolioService.getActivities(cluster, resolvedUserId, walletFilter, activityType, limit);
                    return JSON.stringify(data);
                }

                case "prepare_swap": {
                    let inputMint = this.getStringArg(args, "inputMint");
                    let outputMint = this.getStringArg(args, "outputMint");
                    const amount = Number(args.amount || 0);

                    const isAddress = (str: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(str);

                    if (inputMint && !isAddress(inputMint)) {
                        const upper = inputMint.toUpperCase();
                        if (COMMON_SYMBOLS[upper]) {
                            inputMint = COMMON_SYMBOLS[upper];
                        } else {
                            const searchResult = await this.tokensService.search(cluster, inputMint, 1);
                            if (searchResult && searchResult.length > 0) inputMint = searchResult[0].address;
                        }
                    }

                    if (outputMint && !isAddress(outputMint)) {
                        const upper = outputMint.toUpperCase();
                        if (COMMON_SYMBOLS[upper]) {
                            outputMint = COMMON_SYMBOLS[upper];
                        } else {
                            const searchResult = await this.tokensService.search(cluster, outputMint, 1);
                            if (searchResult && searchResult.length > 0) outputMint = searchResult[0].address;
                        }
                    }

                    let mode: "buy" | "sell" = "buy";
                    let targetMint = outputMint;

                    if (outputMint === COMMON_SYMBOLS.SOL && inputMint !== COMMON_SYMBOLS.SOL) {
                        mode = "sell";
                        targetMint = inputMint;
                    } else {
                        mode = "buy";
                        targetMint = outputMint;
                    }

                    // Fetch price impact from Jupiter (best-effort, won't block if it fails)
                    const priceImpactPct = await this.fetchPriceImpact(cluster, inputMint, outputMint, amount);
                    const priceImpactSeverity = getPriceImpactSeverity(priceImpactPct);

                    if (priceImpactPct !== null) {
                        this.logger.log(`prepare_swap: priceImpact=${(priceImpactPct * 100).toFixed(2)}% severity=${priceImpactSeverity}`, ChatService.name);
                    }

                    const slippageBps = typeof args.slippageBps === "number" ? args.slippageBps : undefined;

                    return JSON.stringify({
                        type: "trade_intent",
                        inputMint,
                        outputMint,
                        targetMint,
                        amount,
                        mode,
                        confirmed: false,
                        priceImpactPct,
                        priceImpactSeverity,
                        slippageBps
                    });
                }

                case "set_slippage": {
                    const rawBps = typeof args.slippageBps === "number" ? args.slippageBps : Number(args.slippageBps);
                    const warnOnly = args.warnOnly === true;

                    if (!Number.isFinite(rawBps) || rawBps <= 0) {
                        return JSON.stringify({ error: "Invalid slippageBps value" });
                    }

                    // Clamp to safe range [1, 5000]
                    const slippageBps = Math.min(5000, Math.max(1, Math.round(rawBps)));
                    const isHigh = slippageBps > 100;

                    return JSON.stringify({
                        type: "slippage_action",
                        slippageBps,
                        warnOnly,
                        isHigh
                    });
                }

                case "navigate_to": {
                    const route = this.getStringArg(args, "route");
                    const isAllowed = STATIC_ROUTES.includes(route) || TOKEN_ROUTE_REGEX.test(route);

                    if (!isAllowed) {
                        this.logger.warn(`navigate_to: rejected disallowed route="${route}"`, ChatService.name);
                        return '{"error": "Route not allowed"}';
                    }

                    return JSON.stringify({
                        type: "navigation",
                        route
                    });
                }

                default:
                    this.logger.warn(`Unknown tool requested: ${toolName}`, ChatService.name);
                    return JSON.stringify({ error: `Unknown tool: ${toolName}` });
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown tool error";
            this.logger.error(`Tool execution failed for ${toolName}: ${message}`, error instanceof Error ? error.stack : undefined, ChatService.name);
            return JSON.stringify({ error: `Tool execution failed: ${toolName}` });
        }
    }

    private getStringArg(args: Record<string, unknown>, key: string): string {
        const value = args[key];
        return typeof value === "string" ? value : "";
    }

    private inferTypedResponseFromTools(messages: ChatMessageEntity[]): ChatResponsePayload | null {
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.role !== "tool") {
            return null;
        }

        // Only look at messages from the current turn (since the last "user" message)
        const lastUserIndex = [...messages].reverse().findIndex((m) => m.role === "user");
        const currentTurnMessages = lastUserIndex !== -1 ? messages.slice(messages.length - lastUserIndex) : messages;

        const recentToolMessages = currentTurnMessages
            .reverse()
            .filter((message) => message.role === "tool")
            .slice(0, 5);

        for (const toolMessage of recentToolMessages) {
            let parsedToolOutput: Record<string, unknown>;

            try {
                parsedToolOutput = JSON.parse(toolMessage.content) as Record<string, unknown>;
            } catch {
                this.logger.debug(`parseResponse fallback: tool output is not JSON tool=${toolMessage.toolName ?? "unknown"}`, ChatService.name);
                continue;
            }

            if (toolMessage.toolName === "set_slippage") {
                const slippageBps = typeof parsedToolOutput.slippageBps === "number" ? parsedToolOutput.slippageBps : Number(parsedToolOutput.slippageBps);
                const warnOnly = parsedToolOutput.warnOnly === true;
                const isHigh = typeof parsedToolOutput.isHigh === "boolean" ? parsedToolOutput.isHigh : slippageBps > 100;

                this.logger.log(`parseResponse fallback: inferred slippage_action slippageBps=${slippageBps} warnOnly=${warnOnly}`, ChatService.name);

                return {
                    sessionId: "",
                    type: "slippage_action",
                    data: {
                        slippageBps: Number.isFinite(slippageBps) ? slippageBps : 50,
                        warnOnly,
                        isHigh
                    }
                };
            }

            if (toolMessage.toolName === "prepare_swap") {
                const inputMint = typeof parsedToolOutput.inputMint === "string" ? parsedToolOutput.inputMint : "";
                const outputMint = typeof parsedToolOutput.outputMint === "string" ? parsedToolOutput.outputMint : "";
                const targetMint = typeof parsedToolOutput.targetMint === "string" ? parsedToolOutput.targetMint : outputMint;
                const mode = (parsedToolOutput.mode as "buy" | "sell") || "buy";
                const amountRaw = parsedToolOutput.amount;
                const amount = typeof amountRaw === "number" ? amountRaw : typeof amountRaw === "string" ? Number(amountRaw) : 0;
                const priceImpactPct = typeof parsedToolOutput.priceImpactPct === "number" ? parsedToolOutput.priceImpactPct : null;
                const priceImpactSeverity =
                    typeof parsedToolOutput.priceImpactSeverity === "string"
                        ? (parsedToolOutput.priceImpactSeverity as "safe" | "warning" | "danger" | "critical")
                        : getPriceImpactSeverity(priceImpactPct);

                this.logger.log(`parseResponse fallback: inferred trade_intent from prepare_swap (mode=${mode})`, ChatService.name);

                return {
                    sessionId: "",
                    type: "trade_intent",
                    data: {
                        inputMint,
                        outputMint,
                        targetMint,
                        mode,
                        amount: Number.isFinite(amount) ? String(amount) : "0",
                        priceImpactPct,
                        priceImpactSeverity,
                        slippageBps: typeof parsedToolOutput.slippageBps === "number" ? parsedToolOutput.slippageBps : undefined
                    }
                };
            }

            if (toolMessage.toolName === "navigate_to") {
                const route = typeof parsedToolOutput.route === "string" ? parsedToolOutput.route : "";

                this.logger.log("parseResponse fallback: inferred navigation from navigate_to", ChatService.name);

                return {
                    sessionId: "",
                    type: "navigation",
                    data: {
                        route,
                        label: route
                    }
                };
            }

            if (toolMessage.toolName === "fetch_portfolio_activities") {
                const activitiesRaw = Array.isArray(parsedToolOutput.activities) ? parsedToolOutput.activities : [];
                this.logger.log("parseResponse fallback: inferred portfolio_activities from fetch_portfolio_activities", ChatService.name);
                return {
                    sessionId: "",
                    type: "portfolio_activities",
                    data: {
                        activities: activitiesRaw,
                        total: typeof parsedToolOutput.total === "number" ? parsedToolOutput.total : activitiesRaw.length,
                        summary: typeof parsedToolOutput.summary === "object" && parsedToolOutput.summary !== null ? parsedToolOutput.summary : {}
                    }
                };
            }

            if (toolMessage.toolName === "fetch_portfolio_performance") {
                this.logger.log("parseResponse fallback: inferred portfolio_performance from fetch_portfolio_performance", ChatService.name);
                return {
                    sessionId: "",
                    type: "portfolio_performance",
                    data:
                        typeof parsedToolOutput.performance === "object" && parsedToolOutput.performance !== null
                            ? (parsedToolOutput.performance as Record<string, unknown>)
                            : parsedToolOutput
                };
            }

            if (toolMessage.toolName === "fetch_portfolio") {
                const totalBalanceUsdRaw = parsedToolOutput.total_balance_usd;
                const totalBalanceSolRaw = parsedToolOutput.total_balance_sol;

                const totalBalanceUsd =
                    typeof totalBalanceUsdRaw === "number" ? totalBalanceUsdRaw : typeof totalBalanceUsdRaw === "string" ? Number(totalBalanceUsdRaw) : 0;
                const totalBalanceSol =
                    typeof totalBalanceSolRaw === "number" ? totalBalanceSolRaw : typeof totalBalanceSolRaw === "string" ? Number(totalBalanceSolRaw) : 0;

                const topTokensRaw = Array.isArray(parsedToolOutput.top_tokens) ? parsedToolOutput.top_tokens : [];

                const topTokens = topTokensRaw
                    .filter((token): token is Record<string, unknown> => typeof token === "object" && token !== null)
                    .map((token) => {
                        const valueUsdRaw = token.value_usd;
                        const valueUsd = typeof valueUsdRaw === "number" ? valueUsdRaw : typeof valueUsdRaw === "string" ? Number(valueUsdRaw) : 0;

                        return {
                            name: typeof token.name === "string" ? token.name : "Unknown",
                            symbol: typeof token.symbol === "string" ? token.symbol : "???",
                            value_usd: Number.isFinite(valueUsd) ? valueUsd : 0
                        };
                    });

                this.logger.log("parseResponse fallback: inferred portfolio_summary from fetch_portfolio", ChatService.name);

                return {
                    sessionId: "",
                    type: "portfolio_summary",
                    data: {
                        total_balance_usd: Number.isFinite(totalBalanceUsd) ? totalBalanceUsd : 0,
                        total_balance_sol: Number.isFinite(totalBalanceSol) ? totalBalanceSol : 0,
                        top_tokens: topTokens
                    }
                };
            }

            if (toolMessage.toolName === "fetch_token_data") {
                const priceRaw = parsedToolOutput.price;
                const priceChangeObj =
                    typeof parsedToolOutput.price_change === "object" && parsedToolOutput.price_change !== null
                        ? (parsedToolOutput.price_change as Record<string, unknown>)
                        : null;
                const priceChange24hRaw = priceChangeObj?.["24h"] ?? parsedToolOutput.price_change_24h;
                const marketCapRaw = parsedToolOutput.market_cap;

                this.logger.log("parseResponse fallback: inferred token_brief from fetch_token_data", ChatService.name);

                const safeNum = (val: unknown) => (val != null && !isNaN(Number(val)) ? Number(val) : undefined);

                return {
                    sessionId: "",
                    type: "token_brief",
                    data: {
                        address: typeof parsedToolOutput.address === "string" ? parsedToolOutput.address : "",
                        symbol: typeof parsedToolOutput.symbol === "string" ? parsedToolOutput.symbol : "",
                        name: typeof parsedToolOutput.name === "string" ? parsedToolOutput.name : "",
                        price: safeNum(priceRaw),
                        priceChange24h: safeNum(priceChange24hRaw),
                        marketCap: safeNum(marketCapRaw),
                        logoUri: typeof parsedToolOutput.logo_uri === "string" ? parsedToolOutput.logo_uri : undefined
                    }
                };
            }
        }

        return null;
    }

    parseResponse(content: string, recentMessages?: ChatMessageEntity[]): ChatResponsePayload {
        try {
            const parsed = JSON.parse(content) as Partial<ChatResponsePayload> & Record<string, unknown>;

            if (parsed.type && RESPONSE_TYPES.includes(parsed.type)) {
                const data =
                    parsed.data && typeof parsed.data === "object"
                        ? parsed.data
                        : Object.fromEntries(Object.entries(parsed).filter(([key]) => !["sessionId", "type", "content"].includes(key)));

                this.logger.log(`parseResponse: structured payload detected type=${parsed.type}`, ChatService.name);

                return {
                    sessionId: "",
                    type: parsed.type,
                    content: typeof parsed.content === "string" ? parsed.content : undefined,
                    data
                };
            }

            this.logger.debug(`parseResponse: JSON parsed but missing/invalid type (keys=${Object.keys(parsed).join(",")})`, ChatService.name);
        } catch {
            this.logger.debug("parseResponse: content is not JSON, returning plain text", ChatService.name);
        }

        if (recentMessages) {
            const inferredResponse = this.inferTypedResponseFromTools(recentMessages);
            if (inferredResponse) {
                this.logger.log(`parseResponse: using inferred typed fallback type=${inferredResponse.type}`, ChatService.name);

                return {
                    ...inferredResponse,
                    content
                };
            }
        }

        this.logger.log("parseResponse: fallback response type=text", ChatService.name);

        return {
            sessionId: "",
            type: "text",
            content
        };
    }

    async getSessionMessages(sessionId: string, cursor?: string, limit: number = 20): Promise<ChatMessageEntity[]> {
        const query = this.messageRepo
            .createQueryBuilder("message")
            .where("message.sessionId = :sessionId", { sessionId })
            .orderBy("message.createdAt", "DESC")
            .take(limit);

        if (cursor) {
            query.andWhere("message.createdAt < :cursor", { cursor: new Date(cursor) });
        }

        const messages = await query.getMany();
        messages.reverse();
        return messages;
    }
}

export interface ChatMessageDto {
    role: "user" | "assistant" | "tool";
    content: string;
    toolCallId?: string;
    toolName?: string;
    userId?: string;
}

export interface ChatSession {
    messages: ChatMessageDto[];
    processing: boolean;
}

export interface PageContext {
    pathname: string;
    tokenAddress?: string;
}

export interface SendMessagePayload {
    message: string;
    sessionId: string;
    userId?: string;
    walletAddress?: string;
    pageContext?: PageContext;
}

export interface ChatResponsePayload {
    sessionId: string;
    type: "text" | "token_brief" | "portfolio_summary" | "navigation" | "trade_intent";
    content?: string;
    data?: Record<string, unknown>;
}

export interface ChatStreamChunkPayload {
    sessionId: string;
    chunk: string;
}

export interface ChatErrorPayload {
    sessionId: string;
    code: "rate_limited" | "processing" | "llm_error" | "unknown";
    message: string;
}

export interface ChatToolProgressPayload {
    sessionId: string;
    label: string;
}

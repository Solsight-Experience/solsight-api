export interface GeminiGenerateRequest {
    prompt: string;
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
}

export interface GeminiGenerateResponse {
    text: string;
    model: string;
    finishReason?: string;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
}

export interface GeminiError {
    message: string;
    code?: string;
    status?: number;
}

export interface GeminiApiError extends Error {
    code?: string | number;
    status?: number;
}

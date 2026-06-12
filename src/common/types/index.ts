export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface ApiResponse<T = JsonValue> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

export interface PaginatedResponse<T = JsonValue> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

export interface SolanaTransactionResponse {
    signature: string;
    status: "pending" | "confirmed" | "failed";
    blockTime?: Date;
    fee?: number;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    message?: string;
    error?: string;
}

export interface PaginatedResponse<T = any> {
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

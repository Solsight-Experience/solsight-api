export interface TokenContext {
    name: string;
    symbol: string;
    description?: string;
    category?: string;
    website?: string;
}

export interface TokenSummaryInput {
    address: string;
    name: string;
    symbol: string;
}

export interface TokenSummaryResult {
    address: string;
    summary: string;
    generatedAt: Date;
    model: string;
    cached: boolean;
    tokenData?: {
        name: string;
        symbol: string;
        price?: number;
        priceChange24h?: number;
    };
}

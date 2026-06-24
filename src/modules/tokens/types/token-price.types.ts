export interface TokenPriceResult {
    priceUsd: number;
    priceChange24h: number;
    source: "redis" | "db" | "coingecko";
}

export const PRICE_TTL_S = 60 * 60;
export const STALE_THRESHOLD_S = 5 * 60;
export const FRESH_MIN_TTL_S = PRICE_TTL_S - STALE_THRESHOLD_S;

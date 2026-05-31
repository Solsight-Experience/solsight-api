export interface SolPriceResponseDto {
    price_usd: number;
    source: "redis" | "coingecko";
}

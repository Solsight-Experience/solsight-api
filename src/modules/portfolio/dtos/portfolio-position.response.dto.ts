export type PortfolioPositionResponseDto = {
    mint: string;
    name: string;
    symbol: string;
    logo: string;
    decimals: number;
    amount: number;
    price: number;
    value_usd: number;
    pnl: number;
    pnl_percent: number;
};

export type PortfolioPositionsResponseDto = {
    positions: PortfolioPositionResponseDto[];
    summary: {
        total_value_usd: number;
        total_tokens: number;
        total_pnl: number;
    };
};

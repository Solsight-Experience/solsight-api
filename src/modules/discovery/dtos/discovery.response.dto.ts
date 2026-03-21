export interface TokenOverview {
    // Basic Info
    address: string;
    symbol: string;
    name: string;
    logo_uri: string;
    network: "solana";
    category: string;
    age_seconds: number;

    // Price & Market
    price: number;
    price_change_1h: number;
    price_change_24h: number;
    price_change_7d: number;
    market_cap: number;
    market_cap_change_24h: number;
    fdv: number;
    liquidity: number;
    liquidity_change_24h: number;
    volume_24h: number;
    volume_change_24h: number;

    // Trading Activity
    txns_24h: {
        total: number;
        buys: number;
        sells: number;
        change_24h: number;
    };

    // Holder Metrics
    holders: {
        count: number;
        change_24h: number;
        unique_wallets_24h: number;
        top_10_percent: number;
        insider_percent: number;
    };

    // Security Audit
    audit: {
        mint_authority_disabled: boolean;
        freeze_authority_disabled: boolean;
        lp_burnt: boolean;
        has_social_links: boolean;
        holders_count: number;
        unique_wallets_24h: number;
        top_10_holders_percent: number;
        insider_percent: number;
        risk_score: number; // 0-100
    };

    // Mini Chart Data (last 24h)
    price_sparkline: number[];
}

export interface CategoryOverview {
    name: string;
    slug: string;
    description: string;
    market_cap: number;
    change_1h: number;
    change_24h: number;
    change_7d: number;
    volume: number;
    num_tokens: number;
    top_tokens: string[]; // token addresses
}

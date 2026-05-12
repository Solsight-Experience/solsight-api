export interface CoinGeckoMarketData {
    id: string;
    symbol: string;
    name: string;
    image: string;
    current_price: number;
    market_cap: number;
    market_cap_rank: number;
    fully_diluted_valuation: number;
    total_volume: number;
    high_24h: number;
    low_24h: number;
    price_change_24h: number;
    price_change_percentage_24h: number;
    price_change_percentage_1h_in_currency?: number;
    price_change_percentage_7d_in_currency?: number;
    market_cap_change_24h: number;
    market_cap_change_percentage_24h: number;
    circulating_supply: number;
    total_supply: number;
    max_supply: number;
    ath: number;
    ath_change_percentage: number;
    ath_date: string;
    atl: number;
    atl_change_percentage: number;
    atl_date: string;
    last_updated: string;
}

export interface CoinGeckoCategory {
    id: string;
    name: string;
    market_cap: number;
    market_cap_change_24h: number;
    content?: string;
    top_3_coins_id?: string[];
    top_3_coins?: string[];
    volume_24h: number;
    updated_at: string;
}

export interface CoinGeckoTrendingItem {
    id: string;
    coin_id: number;
    name: string;
    symbol: string;
    market_cap_rank: number;
    thumb: string;
    small: string;
    large: string;
    slug: string;
    price_btc: number;
    score: number;
}

export interface CoinGeckoTrending {
    coins: Array<{
        item: CoinGeckoTrendingItem;
    }>;
}

export interface CoinGeckoSearchCoin {
    id: string;
    name: string;
    api_symbol: string;
    symbol: string;
    market_cap_rank: number | null;
    thumb: string;
    large: string;
}

export interface CoinGeckoSearchExchange {
    id: string;
    name: string;
    market_type: string;
    thumb: string;
    large: string;
}

export interface CoinGeckoSearchCategory {
    id: string;
    name: string;
}

export interface CoinGeckoSearchNft {
    id: string;
    name: string;
    symbol: string;
    thumb: string;
}

export interface CoinGeckoSearchResult {
    coins: CoinGeckoSearchCoin[];
    exchanges: CoinGeckoSearchExchange[];
    icos: string[];
    categories: CoinGeckoSearchCategory[];
    nfts: CoinGeckoSearchNft[];
}

export interface CoinGeckoSimplePriceData {
    usd?: number;
    usd_market_cap?: number;
    usd_24h_vol?: number;
    usd_24h_change?: number;
    last_updated_at?: number;
    [key: string]: number | undefined;
}

export type CoinGeckoSimplePriceResponse = Record<string, CoinGeckoSimplePriceData>;

export interface CoinGeckoMarketChartRangeResponse {
    prices: [number, number][];
    market_caps: [number, number][];
    total_volumes: [number, number][];
}

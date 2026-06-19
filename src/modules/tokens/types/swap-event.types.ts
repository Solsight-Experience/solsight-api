export type TradeDirection = "BUY" | "SELL";

const STABLECOIN_SYMBOLS = new Set(["USDC", "USDT"]);

const MAX_PRICE_USD = 1_000_000_000; // 1 billion USD — cap for out-of-range detection

export function isValidPrice(price: number): boolean {
    return isFinite(price) && price > 0 && price < MAX_PRICE_USD;
}

export function isStablecoin(token: TokenInfo): boolean {
    return STABLECOIN_SYMBOLS.has(token.symbol);
}

export interface SwapPriceResult {
    priceUsdTokenIn: number;
    priceUsdTokenOut: number;
    volumeUsdTokenIn: number;
    volumeUsdTokenOut: number;
}

export function calculateSwapPrices(swap: SwapEvent): SwapPriceResult {
    const priceNative = swap.price_native;
    const priceUsd = swap.price_usd ?? 0;

    let priceUsdTokenIn: number;
    let priceUsdTokenOut: number;

    if (isStablecoin(swap.token_in)) {
        priceUsdTokenOut = priceUsd;
        priceUsdTokenIn = priceUsd * priceNative;
    } else if (isStablecoin(swap.token_out)) {
        priceUsdTokenIn = priceUsd;
        priceUsdTokenOut = priceNative > 0 ? priceUsd / priceNative : 0;
    } else if (swap.token_in.is_quote) {
        priceUsdTokenOut = priceUsd;
        priceUsdTokenIn = priceUsd * priceNative;
    } else {
        priceUsdTokenIn = priceUsd;
        priceUsdTokenOut = priceNative > 0 ? priceUsd / priceNative : 0;
    }

    return {
        priceUsdTokenIn,
        priceUsdTokenOut,
        volumeUsdTokenIn: swap.token_in.amount_ui * priceUsdTokenIn,
        volumeUsdTokenOut: swap.token_out.amount_ui * priceUsdTokenOut
    };
}

export interface TokenInfo {
    mint: string;
    symbol: string;
    decimals: number;
    amount_raw: string;
    amount_ui: number;
    is_quote: boolean;
}

export interface SwapEvent {
    event_id: string;
    event_type: string;
    timestamp: number;
    slot: number;
    signature: string;
    maker: string;
    direction: TradeDirection;
    token_in: TokenInfo;
    token_out: TokenInfo;
    price_native: number;
    price_usd: number | null;
    fee_amount_ui: number | null;
}

export interface TradeData {
    tx_hash: string;
    timestamp: number;
    type: TradeDirection;
    amount_token: number;
    amount_sol: number;
    price: number;
    price_usd: number;
    market_cap: number;
    trader_address: string;
    tx_url: string;
}

export interface TokenStats {
    timestamp: number;
    price: string;
    price_change: {
        "24h": number;
    };
    market_cap: number;
    market_cap_change_24h: number;
    liquidity: number;
    liquidity_change_24h: number;
    holders: {
        count: number;
        change_24h: number;
    };
    volume: {
        "24h": number;
    };
    volume_change_24h: number;
    txns: {
        "24h": {
            total: number;
            buys: number;
            sells: number;
        };
    };
    txns_change_24h: number;
}

export interface OhlcData {
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface TopTrader {
    address: string;
    name: string | null;
    total_pnl: number;
    realized_pnl: number;
    unrealized_pnl: number;
    roi_percent: number;
    total_bought: number;
    total_sold: number;
    tokens_held: number;
    win_rate: number;
    trades_count: number;
}

export interface HolderData {
    address: string;
    name: string | null;
    balance: number;
    balance_percent: number;
    avg_buy_price: number;
    total_bought: number;
    total_sold: number;
    realized_pnl: number;
    unrealized_pnl: number;
    total_pnl: number;
    roi_percent: number;
    first_tx_time: number;
    last_tx_time: number;
    tx_count: number;
}

export function transformSwapToTrade(swap: SwapEvent, marketCap = 0): TradeData {
    const isBuy = swap.direction === "BUY";
    return {
        tx_hash: swap.signature,
        timestamp: swap.timestamp,
        type: swap.direction,
        amount_token: isBuy ? swap.token_out.amount_ui : swap.token_in.amount_ui,
        amount_sol: isBuy ? swap.token_in.amount_ui : swap.token_out.amount_ui,
        price: swap.price_native,
        price_usd: swap.price_usd ?? swap.price_native,
        market_cap: marketCap,
        trader_address: swap.maker,
        tx_url: `https://solscan.io/tx/${swap.signature}`
    };
}

/**
 * Transform swap to trade data for a specific token
 * @param swap - The swap event
 * @param forTokenMint - The token mint to create trade data for
 * @param priceUsd - The USD price of this token
 */
export function transformSwapToTradeForToken(swap: SwapEvent, forTokenMint: string, priceUsd: number, marketCap = 0): TradeData {
    const isTokenOut = swap.token_out.mint === forTokenMint;
    // If this token is token_out, user is BUYING it
    // If this token is token_in, user is SELLING it
    const tradeType: TradeDirection = isTokenOut ? "BUY" : "SELL";
    const tokenInfo = isTokenOut ? swap.token_out : swap.token_in;
    const otherTokenInfo = isTokenOut ? swap.token_in : swap.token_out;

    return {
        tx_hash: swap.signature,
        timestamp: swap.timestamp,
        type: tradeType,
        amount_token: tokenInfo.amount_ui,
        amount_sol: otherTokenInfo.amount_ui,
        price: swap.price_native,
        price_usd: priceUsd,
        market_cap: marketCap,
        trader_address: swap.maker,
        tx_url: `https://solscan.io/tx/${swap.signature}`
    };
}

export function getTokenMintFromSwap(swap: SwapEvent): string {
    // The non-quote token is the token being traded
    if (!swap.token_in.is_quote) {
        return swap.token_in.mint;
    }
    return swap.token_out.mint;
}

export interface Position {
    token_address: string;
    token_symbol: string;
    token_name: string;
    token_logo: string;
    balance: number;
    price_usd: number;
    value_usd: number;
    price_change_24h: number;
}

export interface WalletSummary {
    total_tokens: number;
    total_value_usd: number;
    total_pnl_24h: number;
    total_pnl_24h_percent: number;
}

export interface Wallet {
    address: string;
    name: string;
    icon: string;
    is_default: boolean;
    is_connected: boolean;
    added_at: Date;
    balance_sol: number;
    balance_usd: number;
    positions: Position[];
    summary: WalletSummary;
}

export interface WalletsResponse {
    wallets: Wallet[];
    total_wallets: number;
    total_balance_sol: number;
    total_balance_usd: number;
}

import { TokenMetadata } from "../tokens/dtos/token.response.dto";
import { TokenTransfer } from "../../infra/solana/constants/types";
import { Transaction, TransactionStatus, TransactionType } from "../transactions/entities/transaction.entity";

export type AggregatedTokenHolding = {
    amount: number;
    decimals: number;
    info?: TokenMetadata;
};

export interface PortfolioTrade {
    signature: string;
    timestamp: number;
    type: "SWAP";
    tokenTransfers: TokenTransfer[];
    description?: string | null;
}

export interface ActivityApp {
    name: string;
    type: "DEX" | "PROGRAM";
    icon: string;
}

export interface ActivityToken {
    address: string;
    symbol?: string;
    logo_uri?: string | null;
    amount: number;
    value_usd: number;
}

export interface PortfolioActivity {
    tx_hash: string;
    type: string;
    timestamp: number;
    status: "success" | "failed";
    app: ActivityApp;
    token_in?: ActivityToken;
    token_out?: ActivityToken;
    token?: ActivityToken;
    from?: string;
    to?: string;
    wallet: string;
    wallet_icon: string;
    tags: string[];
    fee_sol: number;
    fee_usd: number;
    tx_url: string;
}

export interface OverviewToken {
    address: string;
    symbol: string;
    name: string;
    logo_uri: string;
    decimals: number;
    balance: number;
    value_usd: number;
    percent_of_portfolio: number;
    pnl: number;
    price_change_24h: number;
}

export interface AllocationItem {
    symbol: string;
    value_usd: number;
    percentage: number;
}

export interface TransactionInsertRow {
    signature: string;
    network: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    amountOut?: number;
    tokenMint?: string;
    tokenMintOut?: string;
    signerAddress: string;
    blockNumber?: string;
    blockTime: Date;
    memo: string | null;
    metadata: Transaction["metadata"];
}

export type TransactionInsertParam = string | number | Date | null;

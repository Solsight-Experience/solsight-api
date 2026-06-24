import { Holder } from "../entities/holder.entity";
import { HolderData } from "./swap-event.types";

export type HolderUpsertRow = Pick<
    Holder,
    | "tokenMint"
    | "network"
    | "wallet"
    | "balance"
    | "lastActiveSlot"
    | "lastActiveTs"
    | "totalBoughtRaw"
    | "totalSoldRaw"
    | "totalBoughtUsd"
    | "totalSoldUsd"
    | "buyTxCount"
    | "sellTxCount"
    | "updatedAt"
>;

export type HolderEnrichmentInput = {
    wallet: string;
    balance: string | number;
    lastActiveTs?: string | number;
    totalBoughtUsd?: string | number;
    totalSoldUsd?: string | number;
    buyTxCount?: string | number;
    sellTxCount?: string | number;
    redisData?: Record<string, string>;
};

export interface HolderUpdateEvent {
    network?: string;
    mint: string;
    wallet: string;
    balance: number;
    balance_change: number;
    last_active_slot: number;
    last_active_ts: number;
    slot: number;
    signature: string;
    is_new_holder: boolean;
    is_removed: boolean;
    rank: number | null;
    total_bought_raw: number;
    total_sold_raw: number;
    total_bought_usd: number;
    total_sold_usd: number;
    buy_tx_count: number;
    sell_tx_count: number;
}

export interface PriceUpdateEvent {
    network?: string;
    mint: string;
    price_usd: number;
    price_native: number;
    slot: number;
    source: string;
}

export interface EnrichedHolder extends HolderData {
    last_active_ts: number;
    avg_buy_price: number;
    avg_sell_price: number;
    cost_basis: number;
    unrealized_pnl: number;
    realized_pnl: number;
    remaining_usd: number;
    funding_label: string | null;
    account_type: string | null;
    buy_tx_count: number;
    sell_tx_count: number;
}

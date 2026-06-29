import type { Cluster } from "src/common/cluster/cluster.types";

export interface TokenPriceResult {
    priceUsd: number;
    priceChange24h: number;
    source: "redis" | "db" | "coingecko";
}

export type TokenPriceSource = "swap" | "indexer-price-update" | "reference-sync";

export interface TokenPriceWriteInput {
    priceUsd: number;
    priceNative: number;
    slot: number;
    source: TokenPriceSource;
}

/**
 * `source` tracks price origin, not which service replica won the slot race.
 * Allowed values:
 * - `swap`: accepted from a swap event.
 * - `indexer-price-update`: accepted from the dedicated price update channel.
 * - `reference-sync`: reserved for background reference price sync jobs.
 */
export interface TokenPriceSetInput extends TokenPriceWriteInput {
    cluster: Cluster;
    mint: string;
}

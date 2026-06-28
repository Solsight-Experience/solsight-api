import type { Cluster } from "src/common/cluster/cluster.types";

export interface TokenPriceResult {
    priceUsd: number;
    priceChange24h: number;
    source: "redis" | "db" | "coingecko";
}

export interface TokenPriceWriteInput {
    priceUsd: number;
    priceNative: number;
    slot: number;
    source: string;
}

export interface TokenPriceSetInput extends TokenPriceWriteInput {
    cluster: Cluster;
    mint: string;
}

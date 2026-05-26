/**
 * Cluster type definitions and constants for the cluster-switch feature.
 * This is the single source of truth for cluster configuration.
 */

export type Cluster = "mainnet" | "devnet";

export const CLUSTERS = ["mainnet", "devnet"] as const;

/**
 * DI provider tokens for per-cluster DataSources
 */
export const DATA_SOURCE_MAINNET = "DATA_SOURCE_MAINNET";
export const DATA_SOURCE_DEVNET = "DATA_SOURCE_DEVNET";

/**
 * Default cluster when none is specified
 */
export const DEFAULT_CLUSTER: Cluster = "mainnet";

/**
 * Validates if a value is a valid cluster
 */
export function isValidCluster(value: unknown): value is Cluster {
    return CLUSTERS.includes(value as Cluster);
}

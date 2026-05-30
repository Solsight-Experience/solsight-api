export type Cluster = "mainnet" | "devnet";

export const CLUSTERS = ["mainnet", "devnet"] as const;

export const DEFAULT_CLUSTER: Cluster = "mainnet";

export function isValidCluster(value: unknown): value is Cluster {
    return CLUSTERS.includes(value as Cluster);
}

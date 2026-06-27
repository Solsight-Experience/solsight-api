export type Cluster = "mainnet" | "devnet";

export const CLUSTERS = ["mainnet", "devnet"] as const;

export function isValidCluster(value: unknown): value is Cluster {
    return CLUSTERS.includes(value as Cluster);
}

export function requireCluster(value: unknown, source: string): Cluster {
    if (!isValidCluster(value)) {
        throw new Error(`${source} must explicitly specify one of: ${CLUSTERS.join(", ")}`);
    }

    return value;
}

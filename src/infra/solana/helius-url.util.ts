import { Cluster } from "../../common/cluster/cluster.types";

const HELIUS_HOST_MAINNET = "mainnet.helius-rpc.com";
const HELIUS_HOST_DEVNET = "devnet.helius-rpc.com";

export function resolveHeliusRpcUrl(baseUrl: string, cluster: Cluster): string {
    const url = new URL(baseUrl);
    url.hostname = cluster === "devnet" ? HELIUS_HOST_DEVNET : HELIUS_HOST_MAINNET;
    return url.toString();
}

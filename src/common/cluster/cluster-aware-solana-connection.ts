import { Inject, Injectable, Scope } from "@nestjs/common";
import { Connection } from "@solana/web3.js";
import { ClusterProvider } from "./cluster.provider";
import { Cluster } from "./cluster.types";

export const SOLANA_CONNECTION_TOKEN = Symbol("SOLANA_CONNECTION");

@Injectable({ scope: Scope.REQUEST })
export class ClusterAwareSolanaConnection {
    private connection: Connection;

    constructor(private readonly clusterProvider: ClusterProvider) {
        const cluster = this.clusterProvider.cluster;
        const rpcUrl = this.getRpcUrl(cluster);
        this.connection = new Connection(rpcUrl, "confirmed");
    }

    private getRpcUrl(cluster: Cluster): string {
        const rpcUrlMap: Record<Cluster, string> = {
            mainnet: process.env.SOLANA_RPC_URL_MAINNET || "https://api.mainnet-beta.solana.com",
            devnet: process.env.SOLANA_RPC_URL_DEVNET || "https://api.devnet.solana.com"
        };
        return rpcUrlMap[cluster];
    }

    getConnection(): Connection {
        return this.connection;
    }
}

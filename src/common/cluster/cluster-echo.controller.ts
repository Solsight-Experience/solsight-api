import { Controller, Get, Req, Logger } from "@nestjs/common";
import { Request } from "express";
import { ClusterProvider } from "../../common/cluster/cluster.provider";
import { Cluster } from "../../common/cluster/cluster.types";

@Controller("cluster-echo")
export class ClusterEchoController {
    private readonly logger = new Logger(ClusterEchoController.name);

    constructor(private readonly clusterProvider: ClusterProvider) {}

    @Get()
    async getClusterInfo(@Req() req: Request): Promise<{ cluster: Cluster; rpcUrl: string }> {
        const cluster = this.clusterProvider.cluster;

        const rpcUrlMap: Record<Cluster, string> = {
            mainnet: process.env.SOLANA_RPC_URL_MAINNET || "https://api.mainnet-beta.solana.com",
            devnet: process.env.SOLANA_RPC_URL_DEVNET || "https://api.devnet.solana.com"
        };

        return {
            cluster,
            rpcUrl: rpcUrlMap[cluster]
        };
    }
}

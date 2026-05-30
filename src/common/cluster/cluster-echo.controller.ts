import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClusterProvider } from "./cluster.provider";
import { Cluster } from "./cluster.types";
import { resolveHeliusRpcUrl } from "../../infra/solana/helius-url.util";

@Controller("cluster-echo")
export class ClusterEchoController {
    constructor(
        private readonly clusterProvider: ClusterProvider,
        private readonly configService: ConfigService
    ) {}

    @Get()
    getClusterInfo(): { cluster: Cluster; rpcUrl: string } {
        const cluster = this.clusterProvider.cluster;
        const baseUrl = this.configService.getOrThrow<string>("helius.rpcUrl");
        return { cluster, rpcUrl: resolveHeliusRpcUrl(baseUrl, cluster) };
    }
}

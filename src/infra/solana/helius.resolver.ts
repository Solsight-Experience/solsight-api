import { Inject, Injectable } from "@nestjs/common";
import { HeliusService } from "./helius.service";
import { HELIUS_MAINNET, HELIUS_DEVNET } from "./constants/solana.token";
import { ClusterProvider } from "../../common/cluster/cluster.provider";
import { Cluster } from "../../common/cluster/cluster.types";

@Injectable()
export class HeliusResolver {
    constructor(
        @Inject(HELIUS_MAINNET) private readonly mainnet: HeliusService,
        @Inject(HELIUS_DEVNET) private readonly devnet: HeliusService,
        private readonly clusterProvider: ClusterProvider
    ) {}

    get(): HeliusService {
        return this.forCluster(this.clusterProvider.cluster);
    }

    forCluster(cluster: Cluster): HeliusService {
        return cluster === "devnet" ? this.devnet : this.mainnet;
    }
}

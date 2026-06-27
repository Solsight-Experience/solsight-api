import { Inject, Injectable } from "@nestjs/common";
import { HeliusService } from "./helius.service";
import { HELIUS_MAINNET, HELIUS_DEVNET } from "./constants/solana.token";
import type { Cluster } from "../../common/cluster/cluster.types";

@Injectable()
export class HeliusResolver {
    constructor(
        @Inject(HELIUS_MAINNET) private readonly mainnet: HeliusService,
        @Inject(HELIUS_DEVNET) private readonly devnet: HeliusService
    ) {}

    forCluster(cluster: Cluster): HeliusService {
        return cluster === "devnet" ? this.devnet : this.mainnet;
    }
}

import { Injectable } from "@nestjs/common";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { SolsightExecutorService } from "../../solsight-executor/solsight-executor.service";
import { JupiterExecutorService } from "../implementations/jupiter-executor.service";
import type { ExecutorService } from "../interfaces/executor-service.interface";

/**
 * Stateless executor router.
 *
 * Executors own their failures; this service only chooses the implementation
 * that supports the explicitly requested cluster.
 */
@Injectable()
export class CircuitBreaker {
    constructor(
        private readonly jupiter: JupiterExecutorService,
        private readonly solsight: SolsightExecutorService
    ) {}

    forCluster(cluster: Cluster): ExecutorService {
        return cluster === "devnet" ? this.solsight : this.jupiter;
    }
}

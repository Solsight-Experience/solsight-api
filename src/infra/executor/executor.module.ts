import { Module } from "@nestjs/common";
import { JupiterModule } from "../jupiter/jupiter.module";
import { SolsightExecutorModule } from "../solsight-executor/solsight-executor.module";
import { CircuitBreaker } from "./circuit-breaker/circuit-breaker";
import { JupiterExecutorService } from "./implementations/jupiter-executor.service";
import type { ExecutorService, QuoteParams, QuoteResponse, SwapRequest, SwapResponse } from "./interfaces/executor-service.interface";
import type { Cluster } from "../../common/cluster/cluster.types";

@Module({
    imports: [JupiterModule, SolsightExecutorModule],
    providers: [JupiterExecutorService, CircuitBreaker],
    exports: [CircuitBreaker]
})
export class ExecutorModule {}

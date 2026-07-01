import { Module } from "@nestjs/common";
import { JupiterModule } from "../jupiter/jupiter.module";
import { SolsightExecutorModule } from "../solsight-executor/solsight-executor.module";
import { SolsightExecutorService } from "../solsight-executor/solsight-executor.service";
import { EXECUTOR_SERVICE } from "./constants/executor.token";
import { JupiterExecutorService } from "./implementations/jupiter-executor.service";
import type { ExecutorService, QuoteParams, QuoteResponse, SwapRequest, SwapResponse } from "./interfaces/executor-service.interface";
import type { Cluster } from "../../common/cluster/cluster.types";

@Module({
    imports: [JupiterModule, SolsightExecutorModule],
    providers: [
        JupiterExecutorService,
        SolsightExecutorService,
        {
            provide: EXECUTOR_SERVICE,
            useFactory: (jupiterExecutor: JupiterExecutorService, solsightExecutor: SolsightExecutorService): ExecutorService => ({
                getQuote(cluster: Cluster, params: QuoteParams): Promise<QuoteResponse> {
                    return cluster === "mainnet" ? jupiterExecutor.getQuote(cluster, params) : solsightExecutor.getQuote(cluster, params);
                },
                getSwapTransaction(cluster: Cluster, params: SwapRequest): Promise<SwapResponse> {
                    return cluster === "mainnet" ? jupiterExecutor.getSwapTransaction(cluster, params) : solsightExecutor.getSwapTransaction(cluster, params);
                }
            }),
            inject: [JupiterExecutorService, SolsightExecutorService]
        }
    ],
    exports: [EXECUTOR_SERVICE]
})
export class ExecutorModule {}

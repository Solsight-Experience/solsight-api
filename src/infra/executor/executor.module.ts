import { Module } from "@nestjs/common";
import { JupiterModule } from "../jupiter/jupiter.module";
import { SolsightExecutorModule } from "../solsight-executor/solsight-executor.module";
import { CircuitBreaker } from "./circuit-breaker/circuit-breaker";
import { JupiterExecutorService } from "./implementations/jupiter-executor.service";

@Module({
    imports: [JupiterModule, SolsightExecutorModule],
    providers: [JupiterExecutorService, CircuitBreaker],
    exports: [CircuitBreaker]
})
export class ExecutorModule {}

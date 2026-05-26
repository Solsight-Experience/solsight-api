import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JupiterModule } from "../jupiter/jupiter.module";
import { SolsightExecutorModule } from "../solsight-executor/solsight-executor.module";
import { SolsightExecutorService } from "../solsight-executor/solsight-executor.service";
import { EXECUTOR_SERVICE } from "./constants/executor.token";
import { JupiterExecutorService } from "./implementations/jupiter-executor.service";

@Module({
    imports: [JupiterModule, SolsightExecutorModule],
    providers: [
        JupiterExecutorService,
        SolsightExecutorService,
        {
            provide: EXECUTOR_SERVICE,
            useFactory: (configService: ConfigService, jupiterExecutor: JupiterExecutorService, solsightExecutor: SolsightExecutorService) => {
                const provider = configService.get<string>("executor.provider");
                return provider === "solsight" ? solsightExecutor : jupiterExecutor;
            },
            inject: [ConfigService, JupiterExecutorService, SolsightExecutorService]
        }
    ],
    exports: [EXECUTOR_SERVICE]
})
export class ExecutorModule {}

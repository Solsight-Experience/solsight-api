import { Module } from "@nestjs/common";
import { JupiterModule } from "../jupiter/jupiter.module";
import { EXECUTOR_SERVICE } from "./constants/executor.token";
import { JupiterExecutorService } from "./implementations/jupiter-executor.service";

@Module({
    imports: [JupiterModule],
    providers: [
        JupiterExecutorService,
        {
            provide: EXECUTOR_SERVICE,
            useExisting: JupiterExecutorService
        }
    ],
    exports: [EXECUTOR_SERVICE]
})
export class ExecutorModule {}

import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SolsightExecutorService } from "./solsight-executor.service";

@Module({
    imports: [ConfigModule],
    providers: [SolsightExecutorService],
    exports: [SolsightExecutorService]
})
export class SolsightExecutorModule {}

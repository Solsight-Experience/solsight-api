import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { KoraModule } from "../kora/kora.module";
import { SolsightExecutorService } from "./solsight-executor.service";

@Module({
    imports: [ConfigModule, KoraModule],
    providers: [SolsightExecutorService],
    exports: [SolsightExecutorService]
})
export class SolsightExecutorModule {}

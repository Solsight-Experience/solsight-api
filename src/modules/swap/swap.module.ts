import { Module } from "@nestjs/common";
import { SwapController } from "./controllers/swap.controller";
import { SwapService } from "./services/swap.service";
import { ExecutorModule } from "../../infra/executor/executor.module";
import { SolanaModule } from "../../infra/solana/solana.module";

@Module({
    imports: [ExecutorModule, SolanaModule],
    controllers: [SwapController],
    providers: [SwapService]
})
export class SwapModule {}

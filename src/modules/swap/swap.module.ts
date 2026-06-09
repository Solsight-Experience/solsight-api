import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SwapController } from "./controllers/swap.controller";
import { SwapService } from "./services/swap.service";
import { ExecutorModule } from "../../infra/executor/executor.module";
import { JupiterModule } from "../../infra/jupiter/jupiter.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";
import { SolanaModule } from "../../infra/solana/solana.module";
import { SwapExecution } from "../admin-analytics/entities/swap-execution.entity";

@Module({
    imports: [ExecutorModule, JupiterModule, CoinGeckoModule, SolanaModule, TypeOrmModule.forFeature([SwapExecution])],
    controllers: [SwapController],
    providers: [SwapService]
})
export class SwapModule {}

import { Module } from "@nestjs/common";
import { SwapController } from "./controllers/swap.controller";
import { SwapService } from "./services/swap.service";
import { JupiterModule } from "../../infra/jupiter/jupiter.module";
import { ExecutorModule } from "../../infra/executor/executor.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";
import { SolanaModule } from "../../infra/solana/solana.module";

@Module({
    imports: [ExecutorModule, JupiterModule, CoinGeckoModule, SolanaModule],
    controllers: [SwapController],
    providers: [SwapService]
})
export class SwapModule {}

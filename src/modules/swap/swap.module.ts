import { Module } from "@nestjs/common";
import { SwapController } from "./controllers/swap.controller";
import { SwapService } from "./services/swap.service";
import { ExecutorModule } from "../../infra/executor/executor.module";
import { JupiterModule } from "../../infra/jupiter/jupiter.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";
import { SolanaModule } from "../../infra/solana/solana.module";
import { KoraModule } from "../../infra/kora/kora.module";
import { JitoModule } from "../../infra/jito/jito.module";
import { RedisModule } from "../../redis/redis.module";

@Module({
    imports: [ExecutorModule, JupiterModule, CoinGeckoModule, SolanaModule, KoraModule, JitoModule, RedisModule],
    controllers: [SwapController],
    providers: [SwapService]
})
export class SwapModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SwapController } from "./controllers/swap.controller";
import { SwapService } from "./services/swap.service";
import { ExecutorModule } from "../../infra/executor/executor.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";
import { SolanaModule } from "../../infra/solana/solana.module";
import { KoraModule } from "../../infra/kora/kora.module";
import { JitoModule } from "../../infra/jito/jito.module";
import { RedisModule } from "../../redis/redis.module";
import { SwapExecution } from "../admin-analytics/entities/swap-execution.entity";

@Module({
    imports: [ExecutorModule, CoinGeckoModule, SolanaModule, KoraModule, JitoModule, RedisModule, TypeOrmModule.forFeature([SwapExecution])],
    controllers: [SwapController],
    providers: [SwapService]
})
export class SwapModule {}

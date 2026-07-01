import { Module } from "@nestjs/common";
import { SwapController } from "./controllers/swap.controller";
import { SwapService } from "./services/swap.service";
import { ExecutorModule } from "../../infra/executor/executor.module";
import { SolanaModule } from "../../infra/solana/solana.module";
import { KoraModule } from "../../infra/kora/kora.module";
import { JitoModule } from "../../infra/jito/jito.module";
import { RedisModule } from "../../redis/redis.module";
import { TokensModule } from "../tokens/tokens.module";

@Module({
    imports: [ExecutorModule, SolanaModule, KoraModule, JitoModule, RedisModule, TokensModule],
    controllers: [SwapController],
    providers: [SwapService]
})
export class SwapModule {}

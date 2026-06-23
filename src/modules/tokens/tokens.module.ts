import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Token } from "./entities/token.entity";
import { OhlcCandle } from "./entities/ohlc-candle.entity";
import { Holder } from "./entities/holder.entity";
import { TraderPosition } from "./entities/trader-position.entity";
import { TokensService } from "./services/tokens.service";
import { TokensController } from "./controllers/tokens.controller";
import { TokenSeederService } from "./services/token-seeder.service";
import { SolanaModule } from "../../infra/solana/solana.module";
import { JupiterModule } from "../../infra/jupiter/jupiter.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";
import { WebsocketModule } from "../../websocket/websocket.module";
import { RedisModule } from "../../redis/redis.module";
import { TokenSocketService } from "./services/socket/token.socket.service";
import { TokenSocketGateway } from "./services/socket/token.socket.gateway";
import { StatsAggregationService } from "./services/aggregation/stats-aggregation.service";
import { OhlcAggregationService } from "./services/aggregation/ohlc-aggregation.service";
import { OhlcPersistorService } from "./services/aggregation/ohlc-persistor.service";
import { TraderAggregationService } from "./services/aggregation/trader-aggregation.service";
import { HolderAggregationService } from "./services/aggregation/holder-aggregation.service";
import { HolderTrackingService } from "./services/socket/holder-tracking.service";
import { TokenSummaryService } from "./services/token-summary.service";
import { PromptBuilderService } from "./services/prompt-builder.service";
import { GeminiModule } from "../../infra/gemini/gemini.module";
import { TokenPriceService } from "./services/token-price.service";

@Module({
    imports: [
        TypeOrmModule.forFeature([Token, OhlcCandle, Holder, TraderPosition]),
        SolanaModule,
        JupiterModule,
        CoinGeckoModule,
        WebsocketModule,
        RedisModule,
        GeminiModule
    ],
    providers: [
        TokensService,
        TokenSocketService,
        TokenSocketGateway,
        StatsAggregationService,
        OhlcAggregationService,
        OhlcPersistorService,
        TraderAggregationService,
        HolderAggregationService,
        HolderTrackingService,
        TokenSummaryService,
        PromptBuilderService,
        TokenSeederService,
        TokenPriceService
    ],
    controllers: [TokensController],
    exports: [TokensService, HolderTrackingService, TokenPriceService]
})
export class TokensModule {}

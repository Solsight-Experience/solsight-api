import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Token } from "./entities/token.entity";
import { TokensService } from "./services/tokens.service";
import { TokensController } from "./controllers/tokens.controller";
import { TokenSeederService } from "./services/token-seeder.service";
import { SolanaModule } from "src/infra/solana/solana.module";
import { ConfigModule } from "@nestjs/config";
import { WebsocketModule } from "../../websocket/websocket.module";
import { RedisModule } from "../../redis/redis.module";
import { TokenSocketService } from "./services/socket/token.socket.service";
import { TokenSocketGateway } from "./services/socket/token.socket.gateway";
import { StatsAggregationService } from "./services/aggregation/stats-aggregation.service";
import { OhlcAggregationService } from "./services/aggregation/ohlc-aggregation.service";
import { TraderAggregationService } from "./services/aggregation/trader-aggregation.service";
import { HolderAggregationService } from "./services/aggregation/holder-aggregation.service";
import { HolderTrackingService } from "./services/socket/holder-tracking.service";
import { TokenSummaryService } from "./services/token-summary.service";
import { PromptBuilderService } from "./services/prompt-builder.service";
import { GeminiModule } from "../../infra/gemini/gemini.module";

@Module({
    imports: [TypeOrmModule.forFeature([Token]), SolanaModule, ConfigModule, WebsocketModule, RedisModule, GeminiModule],
    providers: [
        TokensService,
        TokenSocketService,
        TokenSocketGateway,
        StatsAggregationService,
        OhlcAggregationService,
        TraderAggregationService,
        HolderAggregationService,
        HolderTrackingService,
        TokenSummaryService,
        PromptBuilderService
        // TokenSeederService,
    ],
    controllers: [TokensController],
    exports: [TokensService, HolderTrackingService]
})
export class TokensModule {}

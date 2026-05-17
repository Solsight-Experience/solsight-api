import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAnalyticsController } from "./controllers/admin-analytics.controller";
import { AdminAnalyticsService } from "./services/admin-analytics.service";
import { AnalyticsRepository } from "./repositories/analytics.repository";
import { SwapExecution } from "./entities/swap-execution.entity";
import { User } from "../users/entities/user.entity";
import { SwapTrade } from "../portfolio/entities/swap-trade.entity";

@Module({
    imports: [TypeOrmModule.forFeature([SwapExecution, User, SwapTrade])],
    controllers: [AdminAnalyticsController],
    providers: [AdminAnalyticsService, AnalyticsRepository]
})
export class AdminAnalyticsModule {}

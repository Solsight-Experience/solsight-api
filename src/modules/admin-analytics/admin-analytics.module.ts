import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAnalyticsController } from "./controllers/admin-analytics.controller";
import { AdminNotificationsController } from "./controllers/admin-notifications.controller";
import { AdminAnalyticsService } from "./services/admin-analytics.service";
import { AdminNotificationsService } from "./services/admin-notifications.service";
import { AnalyticsRepository } from "./repositories/analytics.repository";
import { SwapExecution } from "./entities/swap-execution.entity";
import { User } from "../users/entities/user.entity";
import { SwapTrade } from "../portfolio/entities/swap-trade.entity";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
    imports: [TypeOrmModule.forFeature([SwapExecution, User, SwapTrade]), NotificationsModule],
    controllers: [AdminAnalyticsController, AdminNotificationsController],
    providers: [AdminAnalyticsService, AdminNotificationsService, AnalyticsRepository],
    exports: [AdminAnalyticsService]
})
export class AdminAnalyticsModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminAnalyticsController } from "./controllers/admin-analytics.controller";
import { AdminNotificationsController } from "./controllers/admin-notifications.controller";
import { AdminAnalyticsService } from "./services/admin-analytics.service";
import { AdminNotificationsService } from "./services/admin-notifications.service";
import { AnalyticsRepository } from "./repositories/analytics.repository";
import { SwapExecution } from "./entities/swap-execution.entity";
import { User } from "../users/entities/user.entity";
import { Transaction } from "../transactions/entities/transaction.entity";
import { NotificationsModule } from "../notifications/notifications.module";

@Module({
    imports: [TypeOrmModule.forFeature([SwapExecution, User, Transaction]), NotificationsModule],
    controllers: [AdminAnalyticsController, AdminNotificationsController],
    providers: [AdminAnalyticsService, AdminNotificationsService, AnalyticsRepository],
    exports: [AdminAnalyticsService]
})
export class AdminAnalyticsModule {}

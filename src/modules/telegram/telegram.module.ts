import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { TelegramSubscription } from "./entities/telegram-subscription.entity";
import { TelegramApiService } from "./services/telegram-api.service";
import { TelegramSubscriptionService } from "./services/telegram-subscription.service";
import { TelegramPollerService } from "./services/telegram-poller.service";
import { TelegramController } from "./controllers/telegram.controller";

@Module({
    imports: [TypeOrmModule.forFeature([TelegramSubscription]), ConfigModule],
    providers: [TelegramApiService, TelegramSubscriptionService, TelegramPollerService],
    controllers: [TelegramController],
    exports: [TelegramSubscriptionService]
})
export class TelegramModule {}

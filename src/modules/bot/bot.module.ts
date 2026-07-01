import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule } from "@nestjs/config";
import { BotSubscription } from "./entities/bot-subscription.entity";
import { TelegramApiService } from "../../infra/telegram/telegram-api.service";
import { BotService } from "./services/bot.service";
import { BotPollerService } from "./services/bot-poller.service";
import { BotController } from "./controllers/bot.controller";

@Module({
    imports: [TypeOrmModule.forFeature([BotSubscription]), ConfigModule],
    providers: [TelegramApiService, BotService, BotPollerService],
    controllers: [BotController],
    exports: [BotService]
})
export class BotModule {}

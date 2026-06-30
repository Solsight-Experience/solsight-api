import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { TelegramApiService } from "../../../infra/telegram/telegram-api.service";
import { BotService } from "./bot.service";

@Injectable()
export class BotPollerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(BotPollerService.name);
    private running = false;

    constructor(
        private readonly telegramApi: TelegramApiService,
        private readonly botService: BotService
    ) {}

    onModuleInit(): void {
        if (!this.telegramApi.hasToken) {
            this.logger.warn("TELEGRAM_BOT_TOKEN not set — Telegram long polling disabled");
            return;
        }
        this.running = true;
        void this.pollLoop();
    }

    onModuleDestroy(): void {
        this.running = false;
    }

    private async pollLoop(): Promise<void> {
        while (this.running) {
            try {
                const update = await this.telegramApi.getUpdate(25);
                if (!update) continue;

                const token = update.text.trim().toUpperCase();
                const sub = await this.botService.findPendingByToken(token);
                if (sub) {
                    await this.botService.markVerified(sub.id, update.chatId);
                    await this.botService.sendVerificationConfirmation(update.chatId);
                    this.logger.log(`Bot verified: userId=${sub.userId} chatId=${update.chatId}`);
                }
            } catch (err) {
                this.logger.error("Bot poll loop error", err);
                await new Promise((r) => setTimeout(r, 3000));
            }
        }
    }
}

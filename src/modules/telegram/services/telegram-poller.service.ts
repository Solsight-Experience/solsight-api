import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { TelegramApiService } from "./telegram-api.service";
import { TelegramSubscriptionService } from "./telegram-subscription.service";

@Injectable()
export class TelegramPollerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(TelegramPollerService.name);
    private running = false;

    constructor(
        private readonly telegramApi: TelegramApiService,
        private readonly subscriptionService: TelegramSubscriptionService
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
                const sub = await this.subscriptionService.findPendingByToken(token);
                if (sub) {
                    await this.subscriptionService.markVerified(sub.id, update.chatId);
                    await this.telegramApi.sendMessage(update.chatId, "✅ Connected! You will now receive wallet tracker alerts here.");
                    this.logger.log(`Telegram verified: userId=${sub.userId} chatId=${update.chatId}`);
                }
            } catch (err) {
                this.logger.error("Telegram poll loop error", err);
                await new Promise((r) => setTimeout(r, 3000));
            }
        }
    }
}

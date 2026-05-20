import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ZaloApiService } from "./zalo-api.service";
import { ZaloSubscriptionService } from "./zalo-subscription.service";

@Injectable()
export class ZaloPollerService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(ZaloPollerService.name);
    private running = false;

    constructor(
        private readonly zaloApi: ZaloApiService,
        private readonly subscriptionService: ZaloSubscriptionService
    ) {}

    onModuleInit(): void {
        if (!this.zaloApi.hasToken) {
            this.logger.warn("ZALO_BOT_TOKEN not set — Zalo long polling disabled");
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
                const update = await this.zaloApi.getUpdate(25);
                if (!update) continue;

                const token = update.text.trim().toUpperCase();
                const sub = await this.subscriptionService.findPendingByToken(token);
                if (sub) {
                    await this.subscriptionService.markVerified(sub.id, update.chatId);
                    this.logger.log(`Zalo verified: userId=${sub.userId}`);
                }
            } catch (err) {
                this.logger.error("Zalo poll loop error", err);
                // Brief back-off to avoid hammering on repeated errors
                await new Promise((r) => setTimeout(r, 3000));
            }
        }
    }
}

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { randomBytes } from "crypto";
import { BotSubscription } from "../entities/bot-subscription.entity";
import { TelegramApiService } from "../../../infra/telegram/telegram-api.service";
import { TelegramParseMode } from "../../../infra/telegram/telegram-api.types";

@Injectable()
export class BotService {
    constructor(
        @InjectRepository(BotSubscription)
        private readonly repo: Repository<BotSubscription>,
        private readonly telegramApi: TelegramApiService
    ) {}

    async getSubscription(userId: string): Promise<BotSubscription | null> {
        return this.repo.findOneBy({ userId });
    }

    async generateToken(userId: string): Promise<BotSubscription> {
        const token = this.makeToken();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const existing = await this.repo.findOneBy({ userId });
        if (existing) {
            existing.verificationToken = token;
            existing.tokenExpiresAt = expiresAt;
            existing.isVerified = false;
            existing.telegramChatId = null;
            existing.verifiedAt = null;
            return this.repo.save(existing);
        }

        return this.repo.save(this.repo.create({ userId, verificationToken: token, tokenExpiresAt: expiresAt }));
    }

    async findPendingByToken(token: string): Promise<BotSubscription | null> {
        return this.repo.findOneBy({
            verificationToken: token,
            isVerified: false,
            tokenExpiresAt: MoreThan(new Date())
        });
    }

    async markVerified(subscriptionId: string, chatId: string): Promise<void> {
        await this.repo.update(subscriptionId, {
            isVerified: true,
            telegramChatId: chatId,
            verifiedAt: new Date(),
            verificationToken: null,
            tokenExpiresAt: null
        });
    }

    async sendMessage(userId: string, text: string, parseMode?: TelegramParseMode): Promise<void> {
        if (!this.telegramApi.hasToken) return;
        const sub = await this.repo.findOneBy({ userId, isVerified: true });
        if (!sub?.telegramChatId) return;
        await this.telegramApi.sendMessage(sub.telegramChatId, text, parseMode);
    }

    async sendVerificationConfirmation(chatId: string): Promise<void> {
        await this.telegramApi.sendMessage(chatId, "✅ Connected! You will now receive wallet tracker alerts here.");
    }

    async disconnect(userId: string): Promise<void> {
        await this.repo.update(
            { userId },
            {
                isVerified: false,
                telegramChatId: null,
                verifiedAt: null,
                verificationToken: null,
                tokenExpiresAt: null
            }
        );
    }

    private makeToken(): string {
        return randomBytes(3).toString("hex").toUpperCase();
    }
}

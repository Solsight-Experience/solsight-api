import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThan } from "typeorm";
import { randomBytes } from "crypto";
import { TelegramSubscription } from "../entities/telegram-subscription.entity";
import { TelegramApiService } from "./telegram-api.service";

@Injectable()
export class TelegramSubscriptionService {
    constructor(
        @InjectRepository(TelegramSubscription)
        private readonly repo: Repository<TelegramSubscription>,
        private readonly telegramApi: TelegramApiService
    ) {}

    async getSubscription(userId: string): Promise<TelegramSubscription | null> {
        return this.repo.findOneBy({ userId });
    }

    async generateToken(userId: string): Promise<TelegramSubscription> {
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

    async findPendingByToken(token: string): Promise<TelegramSubscription | null> {
        return this.repo.findOneBy({
            verificationToken: token,
            isVerified: false,
            tokenExpiresAt: MoreThan(new Date())
        });
    }

    async markVerified(subscriptionId: string, telegramChatId: string): Promise<void> {
        await this.repo.update(subscriptionId, {
            isVerified: true,
            telegramChatId,
            verifiedAt: new Date(),
            verificationToken: null,
            tokenExpiresAt: null
        });
    }

    async sendAlertMessage(userId: string, text: string): Promise<void> {
        if (!this.telegramApi.hasToken) return;
        const sub = await this.repo.findOneBy({ userId, isVerified: true });
        if (!sub?.telegramChatId) return;
        await this.telegramApi.sendMessage(sub.telegramChatId, text);
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

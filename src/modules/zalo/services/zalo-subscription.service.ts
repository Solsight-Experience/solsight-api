import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ZaloSubscription } from '../entities/zalo-subscription.entity';
import { ZaloApiService } from './zalo-api.service';

@Injectable()
export class ZaloSubscriptionService {
    constructor(
        @InjectRepository(ZaloSubscription)
        private readonly repo: Repository<ZaloSubscription>,
        private readonly zaloApi: ZaloApiService,
    ) {}

    async getSubscription(userId: string): Promise<ZaloSubscription | null> {
        return this.repo.findOneBy({ userId });
    }

    async generateToken(userId: string): Promise<ZaloSubscription> {
        const token = this.makeToken();
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

        const existing = await this.repo.findOneBy({ userId });
        if (existing) {
            existing.verificationToken = token;
            existing.tokenExpiresAt = expiresAt;
            existing.isVerified = false;
            existing.zaloUserId = null;
            existing.verifiedAt = null;
            return this.repo.save(existing);
        }

        return this.repo.save(
            this.repo.create({ userId, verificationToken: token, tokenExpiresAt: expiresAt }),
        );
    }

    async findPendingByToken(token: string): Promise<ZaloSubscription | null> {
        return this.repo.findOneBy({
            verificationToken: token,
            isVerified: false,
            tokenExpiresAt: MoreThan(new Date()),
        });
    }

    async markVerified(subscriptionId: string, zaloUserId: string): Promise<void> {
        await this.repo.update(subscriptionId, {
            isVerified: true,
            zaloUserId,
            verifiedAt: new Date(),
            verificationToken: null,
            tokenExpiresAt: null,
        });
    }

    async sendAlertMessage(userId: string, text: string): Promise<void> {
        if (!this.zaloApi.hasToken) return;
        const sub = await this.repo.findOneBy({ userId, isVerified: true });
        if (!sub?.zaloUserId) return;
        await this.zaloApi.sendMessage(sub.zaloUserId, text);
    }

    async disconnect(userId: string): Promise<void> {
        await this.repo.update({ userId }, {
            isVerified: false,
            zaloUserId: null,
            verifiedAt: null,
            verificationToken: null,
            tokenExpiresAt: null,
        });
    }

    private makeToken(): string {
        return require('crypto').randomBytes(3).toString('hex').toUpperCase();
    }
}

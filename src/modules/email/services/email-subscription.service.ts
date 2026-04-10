import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { EmailSubscription } from '../entities/email-subscription.entity';
import { EmailApiService } from './email-api.service';

@Injectable()
export class EmailSubscriptionService {
    private readonly verifyBaseUrl: string;

    constructor(
        @InjectRepository(EmailSubscription)
        private readonly repo: Repository<EmailSubscription>,
        private readonly emailApi: EmailApiService,
        config: ConfigService,
    ) {
        this.verifyBaseUrl = config.get<string>('email.verifyBaseUrl') ?? 'http://localhost:3000';
    }

    async getSubscription(userId: string): Promise<EmailSubscription | null> {
        return this.repo.findOneBy({ userId });
    }

    async initiateVerification(userId: string, email: string): Promise<EmailSubscription> {
        const token = this.makeToken();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

        const existing = await this.repo.findOneBy({ userId });
        let sub: EmailSubscription;
        if (existing) {
            existing.email = email;
            existing.verificationToken = token;
            existing.tokenExpiresAt = expiresAt;
            existing.isVerified = false;
            existing.verifiedAt = null;
            sub = await this.repo.save(existing);
        } else {
            sub = await this.repo.save(
                this.repo.create({ userId, email, verificationToken: token, tokenExpiresAt: expiresAt }),
            );
        }

        const verificationUrl = `${this.verifyBaseUrl}/api/email/verify?token=${token}`;
        await this.emailApi.sendVerification(email, verificationUrl);
        return sub;
    }

    async verifyToken(token: string): Promise<string | null> {
        const sub = await this.repo.findOneBy({
            verificationToken: token,
            isVerified: false,
            tokenExpiresAt: MoreThan(new Date()),
        });
        if (!sub) return null;

        await this.repo.update(sub.id, {
            isVerified: true,
            verifiedAt: new Date(),
            verificationToken: null,
            tokenExpiresAt: null,
        });
        return sub.userId;
    }

    async sendAlertEmail(userId: string, subject: string, html: string): Promise<void> {
        if (!this.emailApi.hasKey) return;
        const sub = await this.repo.findOneBy({ userId, isVerified: true });
        if (!sub?.email) return;
        await this.emailApi.sendAlert(sub.email, subject, html);
    }

    async disconnect(userId: string): Promise<void> {
        await this.repo.update({ userId }, {
            isVerified: false,
            email: null,
            verifiedAt: null,
            verificationToken: null,
            tokenExpiresAt: null,
        });
    }

    private makeToken(): string {
        return require('crypto').randomBytes(16).toString('hex');
    }
}

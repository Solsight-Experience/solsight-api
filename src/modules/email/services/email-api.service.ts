import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

@Injectable()
export class EmailApiService {
    private readonly logger = new Logger(EmailApiService.name);
    private readonly resend: Resend | null;
    private readonly fromAddress: string;

    constructor(config: ConfigService) {
        const apiKey = config.get<string>('email.resendApiKey') ?? '';
        this.fromAddress = config.get<string>('email.fromAddress') ?? 'alerts@solsight.app';
        this.resend = apiKey ? new Resend(apiKey) : null;
    }

    get hasKey(): boolean {
        return !!this.resend;
    }

    async sendVerification(toEmail: string, verificationUrl: string): Promise<void> {
        if (!this.resend) {
            this.logger.warn('RESEND_API_KEY not set — skipping verification email');
            return;
        }
        try {
            const result = await this.resend.emails.send({
                from: this.fromAddress,
                to: toEmail,
                subject: 'Verify your email for SolSight alerts',
                html: `
                    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0c1018;color:#e2e8f0;border-radius:12px">
                        <h2 style="margin:0 0 12px;font-size:18px;color:#ffffff">Verify your email</h2>
                        <p style="margin:0 0 24px;font-size:14px;color:#94a3b8;line-height:1.6">
                            Click the button below to verify your email and start receiving SolSight wallet alert notifications.
                        </p>
                        <a href="${verificationUrl}"
                           style="display:inline-block;padding:12px 24px;background:#6366f1;color:#ffffff;
                                  text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
                            Verify Email
                        </a>
                        <p style="margin:24px 0 0;font-size:12px;color:#475569">
                            This link expires in 24 hours. If you didn't request this, ignore this email.
                        </p>
                    </div>
                `,
            });
            if (result.error) {
                this.logger.error(`Resend rejected verification email to ${toEmail}: ${JSON.stringify(result.error)}`);
            } else {
                this.logger.log(`Verification email sent to ${toEmail} (id: ${result.data?.id})`);
            }
        } catch (err) {
            this.logger.error(`Failed to send verification email to ${toEmail}`, err);
        }
    }

    async sendAlert(toEmail: string, subject: string, html: string): Promise<void> {
        if (!this.resend) return;
        try {
            await this.resend.emails.send({
                from: this.fromAddress,
                to: toEmail,
                subject,
                html,
            });
        } catch (err) {
            this.logger.error(`Failed to send alert email to ${toEmail}`, err);
        }
    }
}

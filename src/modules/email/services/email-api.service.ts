import { Injectable, Logger } from "@nestjs/common";
import { EmailSenderService, Templates } from "./sender-service";
import { SendAlertPayload, SendVerificationPayload, SendWalletAlertPayload } from "../types/email-api.types";

@Injectable()
export class EmailApiService {
    private readonly logger = new Logger(EmailApiService.name);

    constructor(private readonly emailSender: EmailSenderService) {}

    get hasKey(): boolean {
        return this.emailSender.hasKey;
    }

    async sendVerification(payload: SendVerificationPayload): Promise<void> {
        if (!this.hasKey) {
            this.logger.warn("RESEND_API_KEY not set — skipping verification email");
            return;
        }

        try {
            await this.emailSender.sendWithTemplate(
                { to: payload.toEmail, subject: "Verify your email for SolSight alerts" },
                Templates.VERIFICATION([payload.verificationUrl])
            );
        } catch (err) {
            this.logger.error(`Failed to send verification email to ${payload.toEmail}`, err);
        }
    }

    async sendAlert(payload: SendAlertPayload): Promise<void> {
        if (!this.hasKey) return;
        try {
            await this.emailSender.sendWithTemplate(
                { to: payload.toEmail, subject: payload.subject },
                Templates.NOTIFICATION_ALERT([payload.title, payload.message])
            );
        } catch (err) {
            this.logger.error(`Failed to send alert email to ${payload.toEmail}`, err);
        }
    }

    async sendWalletAlert(payload: SendWalletAlertPayload): Promise<void> {
        if (!this.hasKey) return;
        try {
            await this.emailSender.sendWithTemplate(
                { to: payload.toEmail, subject: payload.subject },
                Templates.WALLET_ALERT([payload.title, payload.bodyHtml, payload.bodyText])
            );
        } catch (err) {
            this.logger.error(`Failed to send wallet alert email to ${payload.toEmail}`, err);
        }
    }
}

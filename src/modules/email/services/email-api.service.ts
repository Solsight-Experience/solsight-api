import { Injectable, Logger } from "@nestjs/common";
import { EmailSenderService, Templates } from "./sender-service";

@Injectable()
export class EmailApiService {
    private readonly logger = new Logger(EmailApiService.name);

    constructor(private readonly emailSender: EmailSenderService) {}

    get hasKey(): boolean {
        return this.emailSender.hasKey;
    }

    async sendVerification(toEmail: string, verificationUrl: string): Promise<void> {
        if (!this.hasKey) {
            this.logger.warn("RESEND_API_KEY not set — skipping verification email");
            return;
        }

        try {
            await this.emailSender.sendWithTemplate(
                { to: toEmail, subject: "Verify your email for SolSight alerts" },
                Templates.VERIFICATION([verificationUrl])
            );
        } catch (err) {
            this.logger.error(`Failed to send verification email to ${toEmail}`, err);
        }
    }

    async sendAlert(toEmail: string, subject: string, html: string, text?: string): Promise<void> {
        if (!this.hasKey) return;
        try {
            await this.emailSender.send({ to: toEmail, subject, html, text });
        } catch (err) {
            this.logger.error(`Failed to send alert email to ${toEmail}`, err);
        }
    }
}

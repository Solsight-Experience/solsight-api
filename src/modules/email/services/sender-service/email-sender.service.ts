import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Resend } from "resend";
import { SendEmailPayload } from "../../types/email-api.types";
import { BuiltTemplate, TemplateArg } from "../../types/template-store.types";

@Injectable()
export class EmailSenderService {
    private readonly logger = new Logger(EmailSenderService.name);
    private readonly resend: Resend | null;
    private readonly systemAddress: string;

    constructor(private readonly config: ConfigService) {
        const apiKey = config.get<string>("email.resendApiKey");
        this.systemAddress = config.get<string>("email.fromAddress") ?? "alerts@solsight.app";
        this.resend = apiKey ? new Resend(apiKey) : null;
    }

    get hasKey(): boolean {
        return !!this.resend;
    }

    async send(payload: SendEmailPayload): Promise<void> {
        const result = await this.resend?.emails.send({
            from: this.systemAddress,
            to: payload.to,
            subject: payload.subject,
            text: payload.text ?? "",
            html: payload.html ?? ""
        });

        if (result?.error) {
            this.logger.error(`Resend rejected email to ${payload.to}: ${JSON.stringify(result.error)}`);
            throw new Error(result.error.message);
        }

        this.logger.log(`Email sent to ${payload.to} (id: ${result?.data?.id})`);
    }

    async sendWithTemplate<T extends TemplateArg[]>(payload: Pick<SendEmailPayload, "to" | "subject">, tpl: BuiltTemplate<T>): Promise<void> {
        await this.send({
            ...payload,
            html: tpl.renderHtml(),
            text: tpl.renderText()
        });
    }
}

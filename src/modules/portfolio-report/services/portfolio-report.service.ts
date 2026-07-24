import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DailyReportSettingsService } from "./daily-report-settings.service";
import { DailyReportChannel, DailyReportSetting } from "../entities/daily-report-setting.entity";
import { PortfolioService } from "../../portfolio/services/portfolio.service";
import { BotService } from "../../bot/services/bot.service";
import { EmailSubscriptionService } from "../../email/services/email-subscription.service";
import { GeminiService } from "../../../infra/gemini/gemini.service";
import { getErrorMessage, logError } from "../../../common/errors/error-helper";

const REPORT_CLUSTER = "mainnet";
const TOP_TOKENS_LIMIT = 10;

interface PortfolioOverview {
    total_balance_usd: number;
    pnl: { total: number; roi_percent: number };
    top_tokens: { name: string; symbol: string; amount: number; value_usd: number; price?: { priceUsd: number } }[];
    allocation: { name: string; symbol: string; percentage: number }[];
}

@Injectable()
export class PortfolioReportService {
    private readonly logger = new Logger(PortfolioReportService.name);

    constructor(
        private readonly dailyReportSettingsService: DailyReportSettingsService,
        private readonly portfolioService: PortfolioService,
        private readonly botService: BotService,
        private readonly emailSubscriptionService: EmailSubscriptionService,
        private readonly geminiService: GeminiService
    ) {}

    @Cron(CronExpression.EVERY_MINUTE)
    async dispatchDueReports(): Promise<void> {
        const now = new Date();
        const hourUtc = now.getUTCHours();
        const minuteUtc = now.getUTCMinutes();
        const todayUtcDateStr = now.toISOString().slice(0, 10);

        const due = await this.dailyReportSettingsService.getDueSettings(hourUtc, minuteUtc, todayUtcDateStr);

        for (const setting of due) {
            try {
                await this.dispatchOne(setting, todayUtcDateStr);
            } catch (error) {
                this.logger.error(`Failed to send daily report for user ${setting.userId}: ${getErrorMessage(error)}`);
            }
        }
    }

    private async dispatchOne(setting: DailyReportSetting, todayUtcDateStr: string): Promise<void> {
        const connectedChannels: DailyReportChannel[] = [];
        for (const channel of setting.channels) {
            if (await this.dailyReportSettingsService.isChannelConnected(setting.userId, channel)) {
                connectedChannels.push(channel);
            }
        }

        if (connectedChannels.length === 0) {
            this.logger.warn(`Daily report skipped for user ${setting.userId}: no channel is connected anymore`);
            await this.dailyReportSettingsService.disable(setting.id);
            return;
        }

        const overview = (await this.portfolioService.getOverview(REPORT_CLUSTER, setting.userId, undefined, undefined, TOP_TOKENS_LIMIT)) as PortfolioOverview;
        const aiAnalysis = await this.generateAiAnalysis(overview);

        for (const channel of connectedChannels) {
            if (channel === DailyReportChannel.TELEGRAM) {
                await this.botService.sendMessage(setting.userId, this.formatTelegramMessage(overview, aiAnalysis), "Markdown");
            } else {
                const { html, text } = this.formatEmailBody(overview, aiAnalysis);
                await this.emailSubscriptionService.sendWalletAlertEmail(
                    setting.userId,
                    "Your Daily Portfolio Report",
                    "📊 Daily Portfolio Report",
                    html,
                    text
                );
            }
        }

        await this.dailyReportSettingsService.markSent(setting.id, todayUtcDateStr);
    }

    /** Best-effort AI portfolio analysis — returns null (section omitted) if AI is unavailable or the call fails. */
    private async generateAiAnalysis(data: PortfolioOverview): Promise<string | null> {
        if (!this.geminiService.isConfigured()) {
            return null;
        }

        const holdings = data.top_tokens.map((t) => `${t.symbol}: $${t.value_usd.toFixed(2)}`).join(", ") || "none";
        const allocation = data.allocation.map((a) => `${a.symbol} ${a.percentage.toFixed(1)}%`).join(", ") || "none";
        const prompt = [
            "You are a crypto portfolio analyst writing a short daily briefing for a Solana wallet holder.",
            `Total balance: $${data.total_balance_usd.toFixed(2)}`,
            `PnL: $${data.pnl.total.toFixed(2)} (${data.pnl.roi_percent.toFixed(2)}% ROI)`,
            `Top holdings: ${holdings}`,
            `Allocation: ${allocation}`,
            "Write a concise 2-4 sentence analysis of this portfolio's performance and diversification. Plain text only, no markdown, no disclaimers, in English."
        ].join("\n");

        try {
            const response = await this.geminiService.generateText({ prompt, temperature: 0.6, maxOutputTokens: 220 });
            const text = response.text.trim();
            return text.length > 0 ? text : null;
        } catch (error) {
            logError(this.logger, "Failed to generate AI portfolio analysis", error);
            return null;
        }
    }

    /** Trims trailing zeros — e.g. avoids showing "1.0000 SOL" or "$150.2300". */
    private formatAmount(value: number, maxDecimals = 4): string {
        return value.toLocaleString("en-US", { maximumFractionDigits: maxDecimals });
    }

    private formatUsd(value: number): string {
        return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }

    /** Token prices can be well under $0.01, so show more precision for sub-$1 prices. */
    private formatPrice(value: number): string {
        return `$${value.toLocaleString("en-US", { maximumFractionDigits: value < 1 ? 6 : 2 })}`;
    }

    private formatTelegramMessage(data: PortfolioOverview, aiAnalysis: string | null): string {
        const lines: string[] = [
            "📊 *Daily Portfolio Report*",
            "",
            `*Total balance:* ${this.formatUsd(data.total_balance_usd)}`,
            `*PnL:* ${this.formatUsd(data.pnl.total)} (${data.pnl.roi_percent.toFixed(2)}% ROI)`
        ];

        if (data.top_tokens.length > 0) {
            lines.push("", "*Top holdings:*");
            for (const token of data.top_tokens) {
                const amount = this.formatAmount(token.amount);
                const price = this.formatPrice(token.price?.priceUsd ?? 0);
                const value = this.formatUsd(token.value_usd);
                lines.push(`• *${token.symbol}* — ${amount} tokens, worth ${value} (price: ${price}/token)`);
            }
        }

        if (aiAnalysis) {
            lines.push("", "*AI Analysis:*", aiAnalysis);
        }

        return lines.join("\n");
    }

    private formatEmailBody(data: PortfolioOverview, aiAnalysis: string | null): { html: string; text: string } {
        const textLines: string[] = [
            `Total balance: ${this.formatUsd(data.total_balance_usd)}`,
            `PnL: ${this.formatUsd(data.pnl.total)} (${data.pnl.roi_percent.toFixed(2)}% ROI)`
        ];
        if (data.top_tokens.length > 0) {
            textLines.push(
                "",
                "Top holdings:",
                ...data.top_tokens.map((t) => {
                    const amount = this.formatAmount(t.amount);
                    const price = this.formatPrice(t.price?.priceUsd ?? 0);
                    const value = this.formatUsd(t.value_usd);
                    return `- ${t.symbol}: ${amount} tokens, worth ${value} (price: ${price}/token)`;
                })
            );
        }
        if (aiAnalysis) {
            textLines.push("", "AI Analysis:", aiAnalysis);
        }

        const htmlStat = (label: string, value: string) => `<p style="margin:0 0 4px;font-size:14px;color:#e2e8f0">${label} <strong>${value}</strong></p>`;

        const htmlTokenRow = (t: PortfolioOverview["top_tokens"][number]) => `
            <div style="margin:0 0 10px;padding:10px 12px;background:#111827;border-radius:8px">
                <table cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                        <td style="font-size:14px;color:#ffffff;font-weight:600">${t.symbol}</td>
                        <td style="font-size:14px;color:#ffffff;font-weight:600;text-align:right">${this.formatUsd(t.value_usd)}</td>
                    </tr>
                </table>
                <p style="margin:4px 0 0;font-size:12px;color:#94a3b8">
                    ${this.formatAmount(t.amount)} tokens &middot; price ${this.formatPrice(t.price?.priceUsd ?? 0)}/token
                </p>
            </div>`;

        const htmlParts: string[] = [
            htmlStat("Total balance:", this.formatUsd(data.total_balance_usd)),
            htmlStat("PnL:", `${this.formatUsd(data.pnl.total)} (${data.pnl.roi_percent.toFixed(2)}% ROI)`)
        ];
        if (data.top_tokens.length > 0) {
            htmlParts.push('<p style="margin:16px 0 8px;font-size:13px;color:#94a3b8">Top holdings</p>');
            htmlParts.push(...data.top_tokens.map(htmlTokenRow));
        }
        if (aiAnalysis) {
            htmlParts.push('<p style="margin:16px 0 4px;font-size:13px;color:#94a3b8">AI Analysis</p>');
            htmlParts.push(`<p style="margin:0 0 4px;font-size:14px;color:#e2e8f0;line-height:1.6">${aiAnalysis}</p>`);
        }

        return { html: htmlParts.join(""), text: textLines.join("\n") };
    }
}

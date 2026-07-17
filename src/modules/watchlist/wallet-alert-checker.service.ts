import { Injectable } from "@nestjs/common";
import { WalletAlertService } from "./wallet-alert.service";
import { WalletAlertType } from "./entities/wallet-alert.entity";
import { NotificationsService } from "../notifications/services/notifications.service";
import { NotificationEventType, NotificationChannel } from "../notifications/entities/notification.entity";
import { NotificationEmailDto } from "../notifications/dtos/notification-payload.dto";
import { BotService } from "../bot/services/bot.service";
import { TokensService } from "../tokens/services/tokens.service";
import { WalletAlertWithWallet } from "./types/wallet-alert-checker.types";
import { escapeMarkdownV2, markdownV2Link } from "../../infra/telegram/telegram-markdown.util";
import type { SwapEvent } from "../tokens/types/swap-event.types";
import type { HolderUpdateEvent } from "../tokens/types/holder-aggregation.types";
import type { PaymentTransferEvent } from "../billing/types/payment-transfer-event.types";

@Injectable()
export class WalletAlertCheckerService {
    constructor(
        private readonly walletAlertService: WalletAlertService,
        private readonly notificationsService: NotificationsService,
        private readonly tokenService: TokensService,
        private readonly botService: BotService
    ) {}

    /**
     * Called by WalletTrackerHandler when a TRADE_EVENTS swap event arrives.
     * Evaluates ANY_SWAP alerts for wallets that match `event.maker`.
     */
    async handleSwapEvent(event: SwapEvent): Promise<void> {
        const walletAddress = event.maker;
        const cluster = event.network ?? "mainnet";
        const alerts = await this.walletAlertService.getAllActiveAlertsForWallet(walletAddress);
        for (const alert of alerts) {
            if (alert.alertType !== WalletAlertType.ANY_SWAP) continue;
            if (alert.lastCheckedSignature === event.signature) continue;
            const { token_in, token_out } = event;
            const txUrl = cluster === "devnet" ? `https://solscan.io/tx/${event.signature}?cluster=devnet` : `https://solscan.io/tx/${event.signature}`;
            const walletLabel = (alert as WalletAlertWithWallet).watchedWallet?.label ?? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
            const tokenMetas = await this.tokenService.findMany(cluster, [token_in.mint, token_out.mint]);
            const symbolIn = tokenMetas.get(token_in.mint)?.symbol ?? token_in.symbol;
            const symbolOut = tokenMetas.get(token_out.mint)?.symbol ?? token_out.symbol;
            const amountIn = typeof token_in?.amount_ui === "number" ? token_in.amount_ui : undefined;
            const amountOut = typeof token_out?.amount_ui === "number" ? token_out.amount_ui : undefined;
            const alertText = [
                `WalletTracker:\nFrom: ${walletLabel} (${walletAddress})`,
                symbolIn && symbolOut ? `- Swap: ${symbolIn} → ${symbolOut}` : null,
                amountIn != null && symbolIn ? `- Amount in: ${this.fmt(amountIn)} ${symbolIn}` : null,
                amountOut != null && symbolOut ? `- Amount out: ${this.fmt(amountOut)} ${symbolOut}` : null,
                `- Tx: ${txUrl}`
            ]
                .filter(Boolean)
                .join("\n");
            await this.notificationsService.notifyUser(
                alert.userId,
                {
                    type: NotificationEventType.SWAP_EXECUTED,
                    title: symbolIn && symbolOut ? `${symbolIn} → ${symbolOut}` : "Swap",
                    message: [
                        symbolIn && amountIn != null ? `${this.fmt(amountIn)} ${symbolIn}` : null,
                        symbolIn && symbolOut ? "→" : null,
                        symbolOut && amountOut != null ? `${this.fmt(amountOut)} ${symbolOut}` : null,
                        `· ${walletLabel}`
                    ]
                        .filter(Boolean)
                        .join(" "),
                    metadata: {
                        walletAddress,
                        txSignature: event.signature,
                        txUrl,
                        alertId: alert.id,
                        alertType: alert.alertType,
                        mintIn: token_in?.mint,
                        mintOut: token_out?.mint,
                        amountIn,
                        amountOut,
                        walletLabel,
                        walletTrackerUrl: "/wallet-tracker"
                    }
                },
                { channels: [NotificationChannel.WEBSOCKET, NotificationChannel.EMAIL], email: this.walletAlertEmail(alertText) }
            );
            await this.botService.sendMessage(alert.userId, this.toTelegramMarkdown(alertText, "🔄"), "MarkdownV2");
            await this.walletAlertService.updateLastChecked(alert.id, event.signature);
        }
    }

    /**
     * Called by WalletTrackerHandler when a HOLDER_UPDATES event arrives.
     * Evaluates TOKEN_BALANCE_CHANGE alerts for the event's wallet.
     */
    async handleHolderUpdateEvent(event: HolderUpdateEvent): Promise<void> {
        const walletAddress = event.wallet;
        const cluster = event.network ?? "mainnet";
        const alerts = await this.walletAlertService.getAllActiveAlertsForWallet(walletAddress);
        for (const alert of alerts) {
            if (alert.alertType !== WalletAlertType.TOKEN_BALANCE_CHANGE) continue;
            if (!alert.condition?.tokenMint || alert.condition.tokenMint !== event.mint) continue;
            if (alert.lastCheckedSignature === event.signature) continue;
            const { threshold = 0, direction = "any", thresholdType } = alert.condition;
            const change = event.balance_change;
            if (thresholdType !== "percentage" && Math.abs(change) < threshold) continue;
            if (direction === "increase" && change <= 0) continue;
            if (direction === "decrease" && change >= 0) continue;
            const txUrl = cluster === "devnet" ? `https://solscan.io/tx/${event.signature}?cluster=devnet` : `https://solscan.io/tx/${event.signature}`;
            const walletLabel = (alert as WalletAlertWithWallet).watchedWallet?.label ?? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
            const meta = await this.tokenService.findOne(cluster, event.mint).catch(() => undefined);
            const sym = meta?.symbol ?? event.mint.slice(0, 6);
            const alertText = [`WalletTracker:\nFrom: ${walletLabel} (${walletAddress})`, `- Token: ${sym}`, `- Tx: ${txUrl}`].join("\n");
            await this.notificationsService.notifyUser(
                alert.userId,
                {
                    type: NotificationEventType.PRICE_ALERT_TRIGGERED,
                    title: `${sym} balance changed`,
                    message: `${sym} balance changed · ${walletLabel}`,
                    metadata: {
                        walletAddress,
                        txSignature: event.signature,
                        txUrl,
                        alertId: alert.id,
                        alertType: alert.alertType,
                        tokenSymbol: sym,
                        tokenMint: event.mint,
                        walletLabel,
                        walletTrackerUrl: "/wallet-tracker"
                    }
                },
                { channels: [NotificationChannel.WEBSOCKET, NotificationChannel.EMAIL], email: this.walletAlertEmail(alertText) }
            );
            await this.botService.sendMessage(alert.userId, this.toTelegramMarkdown(alertText, "📊"), "MarkdownV2");
            await this.walletAlertService.updateLastChecked(alert.id, event.signature);
        }
    }

    /**
     * Called by WalletTrackerHandler when a PAYMENT_TRANSFERS event arrives.
     * Evaluates LARGE_TRANSFER alerts for wallets matching source or destination.
     */
    async handlePaymentTransferEvent(event: PaymentTransferEvent): Promise<void> {
        const involvedWallets = [event.from_wallet, event.to_wallet];
        const cluster = (event.network ?? "mainnet") as "mainnet" | "devnet";
        for (const walletAddress of involvedWallets) {
            const alerts = await this.walletAlertService.getAllActiveAlertsForWallet(walletAddress);
            for (const alert of alerts) {
                if (alert.alertType !== WalletAlertType.LARGE_TRANSFER) continue;
                if (alert.lastCheckedSignature === event.signature) continue;
                const totalSol = event.lamports / 1e9;
                const minSol = alert.condition?.minAmountSol ?? 1;
                if (totalSol < minSol) continue;
                const txUrl = cluster === "devnet" ? `https://solscan.io/tx/${event.signature}?cluster=devnet` : `https://solscan.io/tx/${event.signature}`;
                const walletLabel = (alert as WalletAlertWithWallet).watchedWallet?.label ?? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`;
                const direction = event.to_wallet === walletAddress ? "Received" : "Sent";
                const counterpart = direction === "Received" ? event.from_wallet : event.to_wallet;
                const counterShort = `${counterpart.slice(0, 6)}...${counterpart.slice(-4)}`;
                const alertText = [
                    `WalletTracker:\nFrom: ${walletLabel} (${walletAddress})`,
                    `- ${direction}: ${this.fmt(totalSol)} SOL`,
                    `- ${direction === "Received" ? "From" : "To"}: ${counterShort}`,
                    `- Tx: ${txUrl}`
                ].join("\n");
                await this.notificationsService.notifyUser(
                    alert.userId,
                    {
                        type: NotificationEventType.TRANSACTION_CONFIRMED,
                        title: `${direction} ${this.fmt(totalSol)} SOL`,
                        message: `${direction} ${this.fmt(totalSol)} SOL · ${walletLabel}`,
                        metadata: {
                            walletAddress,
                            txSignature: event.signature,
                            txUrl,
                            alertId: alert.id,
                            alertType: alert.alertType,
                            amountSol: totalSol,
                            direction,
                            from: event.from_wallet,
                            to: event.to_wallet,
                            walletLabel,
                            walletTrackerUrl: "/wallet-tracker"
                        }
                    },
                    { channels: [NotificationChannel.WEBSOCKET, NotificationChannel.EMAIL], email: this.walletAlertEmail(alertText) }
                );
                await this.botService.sendMessage(alert.userId, this.toTelegramMarkdown(alertText, direction === "Received" ? "📥" : "📤"), "MarkdownV2");
                await this.walletAlertService.updateLastChecked(alert.id, event.signature);
            }
        }
    }

    // alertText lines follow a fixed "WalletTracker:" / "From: label (address)" / "- Key: value" shape;
    // reformat that into Telegram MarkdownV2 instead of duplicating field-building per alert type.
    private toTelegramMarkdown(alertText: string, emoji: string): string {
        const [, fromLine, ...rest] = alertText.split("\n");

        const fromMatch = /^From: (.+) \((.+)\)$/.exec(fromLine ?? "");
        const walletLine = fromMatch ? `👛 *${escapeMarkdownV2(fromMatch[1])}* \\(\`${escapeMarkdownV2(fromMatch[2])}\`\\)` : escapeMarkdownV2(fromLine ?? "");

        const bodyLines = rest.map((line) => {
            const fieldMatch = /^- (.+?): (.+)$/.exec(line);
            if (!fieldMatch) return escapeMarkdownV2(line);
            const [, label, value] = fieldMatch;
            if (label === "Tx") return `🔗 ${markdownV2Link("View transaction", value)}`;
            return `▪️ *${escapeMarkdownV2(label)}:* ${escapeMarkdownV2(value)}`;
        });

        return [`${emoji} *WalletTracker Alert*`, walletLine, ...bodyLines].join("\n");
    }

    private fmt(n: number | undefined): string {
        if (n == null) return "";
        if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
        if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, "");
        const decimals = Math.max(2, -Math.floor(Math.log10(n)) + 1);
        return n.toFixed(decimals);
    }

    // Render the fixed-shape alertText into the HTML body used by the WALLET_ALERT
    // email template: header line bold, "- Key: value" detail lines muted.
    private toEmailHtml(alertText: string): string {
        return alertText
            .split("\n")
            .map((line) =>
                line.startsWith("- ")
                    ? `<p style="margin:4px 0;color:#94a3b8">${line}</p>`
                    : `<p style="margin:0 0 12px;font-weight:600;color:#ffffff">${line}</p>`
            )
            .join("");
    }

    private walletAlertEmail(alertText: string): NotificationEmailDto {
        return { template: "wallet_alert", bodyHtml: this.toEmailHtml(alertText), bodyText: alertText };
    }
}

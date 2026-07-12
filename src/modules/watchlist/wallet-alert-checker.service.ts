import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { WalletAlertService } from "./wallet-alert.service";
import { WalletAlert, WalletAlertType, WalletAlertCondition } from "./entities/wallet-alert.entity";
import { NotificationsService } from "../notifications/services/notifications.service";
import { NotificationEventType } from "../notifications/entities/notification.entity";
import { HeliusResolver } from "../../infra/solana/helius.resolver";
import { BotService } from "../bot/services/bot.service";
import { EmailSubscriptionService } from "../email/services/email-subscription.service";
import { TokensService } from "../tokens/services/tokens.service";
import { COMMON_TOKEN_MINT } from "../tokens/constants/token.constant";
import { EnhancedTransaction } from "../../infra/solana/constants/types";
import { NotificationMetadata, SwapMints, WalletAlertWithWallet } from "./types/wallet-alert-checker.types";
import { escapeMarkdownV2, markdownV2Link } from "../../infra/telegram/telegram-markdown.util";
import type { SwapEvent } from "../tokens/types/swap-event.types";
import type { HolderUpdateEvent } from "../tokens/types/holder-aggregation.types";
import type { PaymentTransferEvent } from "../billing/types/payment-transfer-event.types";

@Injectable()
export class WalletAlertCheckerService implements OnModuleInit {
    private readonly logger = new Logger(WalletAlertCheckerService.name);

    async onModuleInit(): Promise<void> {}

    constructor(
        private readonly walletAlertService: WalletAlertService,
        private readonly notificationsService: NotificationsService,
        private readonly tokenService: TokensService,
        private readonly heliusResolver: HeliusResolver,
        private readonly botService: BotService,
        private readonly emailSubscriptionService: EmailSubscriptionService
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
            const symbolIn = token_in?.symbol;
            const symbolOut = token_out?.symbol;
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
            await this.notificationsService.notifyUser(alert.userId, {
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
            });
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
            await this.notificationsService.notifyUser(alert.userId, {
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
            });
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
                await this.notificationsService.notifyUser(alert.userId, {
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
                });
                await this.botService.sendMessage(alert.userId, this.toTelegramMarkdown(alertText, direction === "Received" ? "📥" : "📤"), "MarkdownV2");
                await this.walletAlertService.updateLastChecked(alert.id, event.signature);
            }
        }
    }

    @Cron("*/5 * * * *")
    async checkAllAlerts(): Promise<void> {
        const alerts = await this.walletAlertService.getAllActiveAlerts();
        if (!alerts.length) return;

        const alertsByKey = new Map<string, WalletAlert[]>();
        for (const alert of alerts) {
            const network = (alert as WalletAlertWithWallet).watchedWallet?.network ?? "mainnet";
            const key = `${alert.walletAddress}::${network}`;
            const list = alertsByKey.get(key) ?? [];
            list.push(alert);
            alertsByKey.set(key, list);
        }

        for (const [, walletAlerts] of alertsByKey) {
            const walletAddress = walletAlerts[0].walletAddress;
            try {
                await this.processWallet(walletAddress, walletAlerts);
            } catch (err) {
                this.logger.error(`Failed to process alerts for ${walletAddress}`, err);
            }
        }
    }

    private async processWallet(walletAddress: string, alerts: WalletAlert[]): Promise<void> {
        const cluster = (alerts[0] as WalletAlertWithWallet).watchedWallet?.network ?? "mainnet";
        const txs = await this.fetchRecentTxs(walletAddress, cluster);
        if (!txs.length) {
            this.logger.debug(`No transactions found for ${walletAddress} (${cluster})`);
            return;
        }

        const latestSig: string = txs[0].signature;
        this.logger.debug(`Wallet ${walletAddress} (${cluster}): ${txs.length} txs, latest=${latestSig.slice(0, 8)}...`);

        for (const alert of alerts) {
            // First-time initialization: set the cursor without triggering notifications
            if (!alert.lastCheckedSignature) {
                this.logger.log(`Alert ${alert.id} initialized cursor to ${latestSig.slice(0, 8)}... (${cluster})`);
                await this.walletAlertService.updateLastChecked(alert.id, latestSig);
                continue;
            }

            const newTxs = this.getNewTransactions(txs, alert.lastCheckedSignature);
            this.logger.log(
                `Alert ${alert.id} (${alert.alertType}) [${walletAddress.slice(0, 6)}... ${cluster}]: ${newTxs.length} new tx(s), cursor=${alert.lastCheckedSignature.slice(0, 8)}...`
            );
            if (!newTxs.length) continue;

            for (const tx of newTxs) {
                this.logger.debug(`Alert ${alert.id} evaluating tx ${tx.signature} type=${tx.type} hasSwapEvent=${!!tx.events?.swap} source=${tx.source}`);
                if (this.evaluateAlert(alert, tx, walletAddress)) {
                    this.logger.log(`Alert ${alert.id} triggered by tx ${tx.signature} (type: ${tx.type})`);
                    await this.sendNotification(alert, tx, cluster).catch((err) => this.logger.error(`Failed to send notification for alert ${alert.id}`, err));
                }
            }

            await this.walletAlertService.updateLastChecked(alert.id, latestSig);
        }
    }

    /** Returns txs newer than lastCheckedSig (Helius returns newest-first) */
    private getNewTransactions(txs: EnhancedTransaction[], lastCheckedSig: string): EnhancedTransaction[] {
        const idx = txs.findIndex((tx) => tx.signature === lastCheckedSig);
        return idx === -1 ? txs : txs.slice(0, idx);
    }

    private async fetchRecentTxs(walletAddress: string, cluster: "mainnet" | "devnet"): Promise<EnhancedTransaction[]> {
        try {
            return await this.heliusResolver.forCluster(cluster).getEnhancedTransactionsByAddress(walletAddress, { limit: 50 });
        } catch (err) {
            this.logger.warn(`fetchRecentTxs failed for ${walletAddress} (${cluster}): ${err instanceof Error ? err.message : String(err)}`);
            return [];
        }
    }

    private evaluateAlert(alert: WalletAlert, tx: EnhancedTransaction, walletAddress: string): boolean {
        switch (alert.alertType) {
            case WalletAlertType.ANY_SWAP: {
                const DEX_SOURCES = [
                    "JUPITER",
                    "RAYDIUM",
                    "ORCA",
                    "METEORA",
                    "PHOENIX",
                    "OPENBOOK",
                    "SOLFI",
                    "PUMP_FUN",
                    "PUMP_AMM",
                    "MOONSHOT",
                    "FLUXBEAM",
                    "ALDRIN",
                    "LIFINITY",
                    "INVARIANT"
                ];
                if (tx.type === "SWAP" || !!tx.events?.swap || DEX_SOURCES.includes(tx.source)) return true;
                // Structural detection via tokenTransfers
                const nativeSolOut = (tx.nativeTransfers ?? []).some((t) => t.fromUserAccount === walletAddress && t.amount > 0);
                const tokenIn = (tx.tokenTransfers ?? []).some((t) => t.toUserAccount === walletAddress);
                const tokenOut = (tx.tokenTransfers ?? []).some((t) => t.fromUserAccount === walletAddress);
                if ((nativeSolOut && tokenIn) || (tokenOut && tokenIn) || tokenIn) return true;
                // Devnet fallback: Helius on devnet returns empty tokenTransfers but populates
                // accountData.tokenBalanceChanges — detect swap if wallet received a token plus
                // either sent another token or spent SOL.
                const walletAccData = (tx.accountData ?? []).find((d) => d.account === walletAddress);
                const changes = walletAccData?.tokenBalanceChanges ?? [];
                const hasTokenIn = changes.some((c) => parseFloat(c.rawTokenAmount?.tokenAmount ?? "0") > 0);
                const hasTokenOut = changes.some((c) => parseFloat(c.rawTokenAmount?.tokenAmount ?? "0") < 0);
                const solSpent = (walletAccData?.nativeBalanceChange ?? 0) < 0;
                return hasTokenIn && (hasTokenOut || solSpent);
            }

            case WalletAlertType.TOKEN_BALANCE_CHANGE:
                return this.checkTokenChange(alert.condition, tx, walletAddress);

            case WalletAlertType.LARGE_TRANSFER:
                return this.checkLargeTransfer(alert.condition, tx);

            default:
                return false;
        }
    }

    private checkTokenChange(condition: WalletAlertCondition | undefined, tx: EnhancedTransaction, walletAddress: string): boolean {
        if (!condition?.tokenMint) return false;

        let netChange = 0;

        const transfers = (tx.tokenTransfers ?? []).filter((t) => t.mint === condition.tokenMint);
        for (const t of transfers) {
            const amount: number = t.tokenAmount ?? 0;
            if (t.toUserAccount === walletAddress) netChange += amount;
            else if (t.fromUserAccount === walletAddress) netChange -= amount;
        }

        // Devnet fallback: use accountData.tokenBalanceChanges when tokenTransfers is missing
        if (!transfers.length) {
            const walletAccData = (tx.accountData ?? []).find((d) => d.account === walletAddress);
            for (const c of walletAccData?.tokenBalanceChanges ?? []) {
                if (c.mint === condition.tokenMint) {
                    netChange += parseFloat(c.rawTokenAmount?.tokenAmount ?? "0");
                }
            }
        }

        if (netChange === 0) return false;

        const threshold = condition.threshold ?? 0;
        if (Math.abs(netChange) < threshold) return false;

        const dir = condition.direction ?? "any";
        if (dir === "increase" && netChange <= 0) return false;
        if (dir === "decrease" && netChange >= 0) return false;

        return true;
    }

    private checkLargeTransfer(condition: WalletAlertCondition | undefined, tx: EnhancedTransaction): boolean {
        if (tx.type !== "TRANSFER") return false;
        const minSol = condition?.minAmountSol ?? 1;
        const nativeTransfers = tx.nativeTransfers ?? [];
        const totalSol = nativeTransfers.reduce((sum, t) => sum + (t.amount ?? 0), 0) / 1e9;
        return totalSol >= minSol;
    }

    /** Extract swap token mints + amounts from a Helius transaction */
    private extractSwapMints(tx: EnhancedTransaction, walletAddress: string): SwapMints {
        const dex = tx.source && tx.source !== "UNKNOWN" ? tx.source : undefined;
        const swap = tx.events?.swap;
        let mintIn: string | undefined, mintOut: string | undefined;
        let amountIn: number | undefined, amountOut: number | undefined;

        if (swap) {
            if (swap.nativeInput) {
                mintIn = COMMON_TOKEN_MINT.SOL;
                amountIn = Number(swap.nativeInput.amount) / 1e9;
            } else if (swap.tokenInputs?.[0]) {
                const i = swap.tokenInputs[0];
                mintIn = i.mint;
                amountIn = parseFloat(i.rawTokenAmount?.tokenAmount ?? "0");
            }
            if (swap.nativeOutput) {
                mintOut = COMMON_TOKEN_MINT.SOL;
                amountOut = Number(swap.nativeOutput.amount) / 1e9;
            } else if (swap.tokenOutputs?.[0]) {
                const o = swap.tokenOutputs[0];
                mintOut = o.mint;
                amountOut = parseFloat(o.rawTokenAmount?.tokenAmount ?? "0");
            }
        } else {
            const sold = (tx.tokenTransfers ?? []).find((t) => t.fromUserAccount === walletAddress);
            const bought = (tx.tokenTransfers ?? []).find((t) => t.toUserAccount === walletAddress);
            if (sold) {
                mintIn = sold.mint;
                amountIn = sold.tokenAmount;
            }
            if (bought) {
                mintOut = bought.mint;
                amountOut = bought.tokenAmount;
            }
            // SOL → token: no token sold, but SOL was spent natively (buy)
            if (!mintIn) {
                const solSpent = (tx.nativeTransfers ?? []).filter((t) => t.fromUserAccount === walletAddress).reduce((sum, t) => sum + (t.amount ?? 0), 0);
                if (solSpent > 0) {
                    mintIn = COMMON_TOKEN_MINT.SOL;
                    amountIn = solSpent / 1e9;
                }
            }
            // token → SOL: no token received, but SOL was received natively (sell)
            if (!mintOut) {
                const solReceived = (tx.nativeTransfers ?? []).filter((t) => t.toUserAccount === walletAddress).reduce((sum, t) => sum + (t.amount ?? 0), 0);
                if (solReceived > 0) {
                    mintOut = COMMON_TOKEN_MINT.SOL;
                    amountOut = solReceived / 1e9;
                }
            }
            // Devnet fallback: use accountData.tokenBalanceChanges when tokenTransfers is empty
            if (!mintIn && !mintOut) {
                const walletAccData = (tx.accountData ?? []).find((d) => d.account === walletAddress);
                for (const c of walletAccData?.tokenBalanceChanges ?? []) {
                    const raw = parseFloat(c.rawTokenAmount?.tokenAmount ?? "0");
                    if (raw < 0 && !mintIn) {
                        mintIn = c.mint;
                        amountIn = Math.abs(raw);
                    } else if (raw > 0 && !mintOut) {
                        mintOut = c.mint;
                        amountOut = raw;
                    }
                }
                if (!mintIn && (walletAccData?.nativeBalanceChange ?? 0) < 0) {
                    mintIn = COMMON_TOKEN_MINT.SOL;
                    amountIn = Math.abs(walletAccData!.nativeBalanceChange) / 1e9;
                }
            }
        }
        return { mintIn, mintOut, amountIn, amountOut, dex };
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

    private async sendNotification(alert: WalletAlert, tx: EnhancedTransaction, cluster: "mainnet" | "devnet"): Promise<void> {
        const short = `${alert.walletAddress.slice(0, 6)}...${alert.walletAddress.slice(-4)}`;
        const walletLabel = (alert as WalletAlertWithWallet).watchedWallet?.label ?? short;
        const txUrl = cluster === "devnet" ? `https://solscan.io/tx/${tx.signature}?cluster=devnet` : `https://solscan.io/tx/${tx.signature}`;
        const walletTrackerUrl = `/wallet-tracker`;
        let type: NotificationEventType;
        let title: string;
        let message: string;
        let alertText: string;
        let emoji: string;
        let extraMeta: NotificationMetadata = {};

        const alertHeader = `WalletTracker:\nFrom: ${walletLabel} (${alert.walletAddress})`;

        switch (alert.alertType) {
            case WalletAlertType.ANY_SWAP: {
                const { mintIn, mintOut, amountIn, amountOut, dex } = this.extractSwapMints(tx, alert.walletAddress);

                const [metaIn, metaOut] = await Promise.all([
                    mintIn ? this.tokenService.findOne(cluster, mintIn) : Promise.resolve(undefined),
                    mintOut ? this.tokenService.findOne(cluster, mintOut) : Promise.resolve(undefined)
                ]);

                const symbolIn = metaIn?.symbol;
                const symbolOut = metaOut?.symbol;
                const nameIn = metaIn?.name;
                const nameOut = metaOut?.name;
                const logoIn = metaIn?.logo_uri;
                const logoOut = metaOut?.logo_uri;

                type = NotificationEventType.SWAP_EXECUTED;
                emoji = "🔄";

                const pair = symbolIn && symbolOut ? `${symbolIn} → ${symbolOut}` : "Swap";
                title = pair;
                message = [
                    symbolIn && amountIn != null ? `${this.fmt(amountIn)} ${symbolIn}` : null,
                    symbolIn && symbolOut ? "→" : null,
                    symbolOut && amountOut != null ? `${this.fmt(amountOut)} ${symbolOut}` : null,
                    dex ? `via ${dex}` : null,
                    `· ${walletLabel}`
                ]
                    .filter(Boolean)
                    .join(" ");

                alertText = [
                    alertHeader,
                    `- Swap: ${symbolIn ?? "?"} → ${symbolOut ?? "?"}`,
                    amountIn != null && symbolIn ? `- Amount in: ${this.fmt(amountIn)} ${symbolIn}` : null,
                    amountOut != null && symbolOut ? `- Amount out: ${this.fmt(amountOut)} ${symbolOut}` : null,
                    dex ? `- DEX: ${dex}` : null,
                    `- Tx: ${txUrl}`
                ]
                    .filter(Boolean)
                    .join("\n");

                extraMeta = {
                    tokenIn: symbolIn,
                    tokenOut: symbolOut,
                    tokenInName: nameIn,
                    tokenOutName: nameOut,
                    tokenInLogo: logoIn ?? undefined,
                    tokenOutLogo: logoOut ?? undefined,
                    amountIn,
                    amountOut,
                    mintIn,
                    mintOut,
                    dex,
                    walletLabel,
                    walletTrackerUrl
                };
                break;
            }
            case WalletAlertType.TOKEN_BALANCE_CHANGE: {
                const mint = alert.condition?.tokenMint;
                const meta = mint ? await this.tokenService.findOne(cluster, mint) : undefined;
                const sym = meta?.symbol ?? alert.condition?.tokenSymbol ?? "Token";
                const cond = alert.condition;
                type = NotificationEventType.PRICE_ALERT_TRIGGERED;
                emoji = "📊";
                title = `${sym} balance changed`;
                message = `${sym} balance changed · ${walletLabel}`;

                alertText = [
                    alertHeader,
                    `- Token: ${sym}`,
                    cond?.direction && cond.direction !== "any" ? `- Direction: ${cond.direction}` : null,
                    cond?.threshold != null ? `- Threshold: ≥ ${cond.threshold}${cond.thresholdType === "percentage" ? "%" : ""}` : null,
                    `- Tx: ${txUrl}`
                ]
                    .filter(Boolean)
                    .join("\n");

                extraMeta = {
                    tokenSymbol: sym,
                    tokenMint: mint,
                    tokenLogo: meta?.logo_uri ?? undefined,
                    walletLabel,
                    walletTrackerUrl
                };
                break;
            }
            case WalletAlertType.LARGE_TRANSFER: {
                const nativeTransfers = tx.nativeTransfers ?? [];
                const totalSol = nativeTransfers.reduce((s, t) => s + (t.amount ?? 0), 0) / 1e9;
                const from: string | undefined = nativeTransfers[0]?.fromUserAccount;
                const to: string | undefined = nativeTransfers[0]?.toUserAccount;
                const direction = to === alert.walletAddress ? "Received" : "Sent";
                const solMeta = await this.tokenService.findOne(cluster, COMMON_TOKEN_MINT.SOL);
                type = NotificationEventType.TRANSACTION_CONFIRMED;
                emoji = direction === "Received" ? "📥" : "📤";
                title = `${direction} ${this.fmt(totalSol)} SOL`;
                message = `${direction} ${this.fmt(totalSol)} SOL · ${walletLabel}`;

                const counterpart = direction === "Received" ? from : to;
                const counterShort = counterpart ? `${counterpart.slice(0, 6)}...${counterpart.slice(-4)}` : undefined;
                alertText = [
                    alertHeader,
                    `- ${direction}: ${this.fmt(totalSol)} SOL`,
                    counterShort ? `- ${direction === "Received" ? "From" : "To"}: ${counterShort}` : null,
                    `- Tx: ${txUrl}`
                ]
                    .filter(Boolean)
                    .join("\n");

                extraMeta = {
                    amountSol: totalSol,
                    direction,
                    from,
                    to,
                    tokenLogo: solMeta?.logo_uri ?? undefined,
                    walletLabel,
                    walletTrackerUrl
                };
                break;
            }
            default:
                return;
        }

        const emailHtml = alertText
            .split("\n")
            .map((line) =>
                line.startsWith("- ")
                    ? `<p style="margin:4px 0;color:#94a3b8">${line}</p>`
                    : `<p style="margin:0 0 12px;font-weight:600;color:#ffffff">${line}</p>`
            )
            .join("");

        await this.notificationsService.notifyUser(alert.userId, {
            type,
            title,
            message,
            metadata: {
                walletAddress: alert.walletAddress,
                walletShort: short,
                txSignature: tx.signature,
                txUrl,
                alertId: alert.id,
                alertType: alert.alertType,
                ...extraMeta
            }
        });

        await this.botService.sendMessage(alert.userId, this.toTelegramMarkdown(alertText, emoji), "MarkdownV2");
        await this.emailSubscriptionService.sendWalletAlertEmail(alert.userId, title, title, emailHtml, alertText);
    }
}

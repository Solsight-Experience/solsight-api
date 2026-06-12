import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ClsService } from "nestjs-cls";
import { WalletAlertService } from "./wallet-alert.service";
import { WalletAlert, WalletAlertType, WalletAlertCondition } from "./entities/wallet-alert.entity";
import { NotificationsService } from "../notifications/services/notifications.service";
import { NotificationEventType } from "../notifications/entities/notification.entity";
import { HeliusResolver } from "../../infra/solana/helius.resolver";
import { ZaloSubscriptionService } from "../zalo/services/zalo-subscription.service";
import { EmailSubscriptionService } from "../email/services/email-subscription.service";
import { TokensService } from "../tokens/services/tokens.service";
import { COMMON_TOKEN_MINT } from "../tokens/constants/token.constant";
import { CLUSTER_CLS_KEY } from "../../common/cluster/cluster.provider";
import { EnhancedTransaction } from "../../infra/solana/constants/types";

interface SwapMints {
    mintIn?: string;
    mintOut?: string;
    amountIn?: number;
    amountOut?: number;
    dex?: string;
}

type WalletAlertWithWallet = WalletAlert & {
    watchedWallet?: {
        label?: string | null;
    };
};

interface NotificationMetadata {
    tokenIn?: string;
    tokenOut?: string;
    tokenInName?: string;
    tokenOutName?: string;
    tokenInLogo?: string;
    tokenOutLogo?: string;
    amountIn?: number;
    amountOut?: number;
    mintIn?: string;
    mintOut?: string;
    dex?: string;
    walletLabel?: string;
    walletTrackerUrl?: string;
    tokenSymbol?: string;
    tokenMint?: string;
    tokenLogo?: string;
    amountSol?: number;
    direction?: string;
    from?: string;
    to?: string;
}

@Injectable()
export class WalletAlertCheckerService implements OnModuleInit {
    private readonly logger = new Logger(WalletAlertCheckerService.name);

    async onModuleInit(): Promise<void> {}

    constructor(
        private readonly walletAlertService: WalletAlertService,
        private readonly notificationsService: NotificationsService,
        private readonly tokenService: TokensService,
        private readonly heliusResolver: HeliusResolver,
        private readonly zaloSubscriptionService: ZaloSubscriptionService,
        private readonly emailSubscriptionService: EmailSubscriptionService,
        private readonly cls: ClsService
    ) {}

    @Cron("*/10 * * * * *")
    async checkAllAlerts(): Promise<void> {
        return this.cls.run(async () => {
            this.cls.set(CLUSTER_CLS_KEY, "mainnet");
            const alerts = await this.walletAlertService.getAllActiveAlerts();
            if (!alerts.length) return;

            const alertsByWallet = new Map<string, WalletAlert[]>();
            for (const alert of alerts) {
                const list = alertsByWallet.get(alert.walletAddress) ?? [];
                list.push(alert);
                alertsByWallet.set(alert.walletAddress, list);
            }

            for (const [walletAddress, walletAlerts] of alertsByWallet) {
                try {
                    await this.processWallet(walletAddress, walletAlerts);
                } catch (err) {
                    this.logger.error(`Failed to process alerts for ${walletAddress}`, err);
                }
            }
        });
    }

    private async processWallet(walletAddress: string, alerts: WalletAlert[]): Promise<void> {
        const txs = await this.fetchRecentTxs(walletAddress);
        if (!txs.length) return;

        const latestSig: string = txs[0].signature;

        for (const alert of alerts) {
            // First-time initialization: set the cursor without triggering notifications
            if (!alert.lastCheckedSignature) {
                await this.walletAlertService.updateLastChecked(alert.id, latestSig);
                continue;
            }

            const newTxs = this.getNewTransactions(txs, alert.lastCheckedSignature);
            this.logger.log(`Alert ${alert.id} (${alert.alertType}): ${newTxs.length} new tx(s)`);
            if (!newTxs.length) continue;

            for (const tx of newTxs) {
                this.logger.debug(`Alert ${alert.id} evaluating tx ${tx.signature} type=${tx.type} hasSwapEvent=${!!tx.events?.swap} source=${tx.source}`);
                if (this.evaluateAlert(alert, tx, walletAddress)) {
                    this.logger.log(`Alert ${alert.id} triggered by tx ${tx.signature} (type: ${tx.type})`);
                    await this.sendNotification(alert, tx).catch((err) => this.logger.error(`Failed to send notification for alert ${alert.id}`, err));
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

    private async fetchRecentTxs(walletAddress: string): Promise<EnhancedTransaction[]> {
        try {
            return await this.heliusResolver.forCluster("mainnet").getEnhancedTransactionsByAddress(walletAddress, { limit: 50 });
        } catch {
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
                // Structural detection: SOL spent + token received (buy), or token sent + token received (swap)
                const nativeSolOut = (tx.nativeTransfers ?? []).some((t) => t.fromUserAccount === walletAddress && t.amount > 0);
                const tokenIn = (tx.tokenTransfers ?? []).some((t) => t.toUserAccount === walletAddress);
                const tokenOut = (tx.tokenTransfers ?? []).some((t) => t.fromUserAccount === walletAddress);
                if ((nativeSolOut && tokenIn) || (tokenOut && tokenIn)) return true;
                // Last resort: Jupiter multi-hop routes split into separate txs (each looks like TRANSFER).
                // Treat any tx where the wallet received a token as a swap trigger, since ANY_SWAP
                // alerts care about token movements regardless of Helius classification.
                return tokenIn;
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

        const transfers = tx.tokenTransfers ?? [];
        const relevant = transfers.filter((t) => t.mint === condition.tokenMint);
        if (!relevant.length) return false;

        let netChange = 0;
        for (const t of relevant) {
            const amount: number = t.tokenAmount ?? 0;
            if (t.toUserAccount === walletAddress) netChange += amount;
            else if (t.fromUserAccount === walletAddress) netChange -= amount;
        }

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
        }
        return { mintIn, mintOut, amountIn, amountOut, dex };
    }

    private fmt(n: number | undefined): string {
        if (n == null) return "";
        if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
        if (n >= 1) return n.toFixed(4).replace(/\.?0+$/, "");
        const decimals = Math.max(2, -Math.floor(Math.log10(n)) + 1);
        return n.toFixed(decimals);
    }

    private async sendNotification(alert: WalletAlert, tx: EnhancedTransaction): Promise<void> {
        const short = `${alert.walletAddress.slice(0, 6)}...${alert.walletAddress.slice(-4)}`;
        const walletLabel = (alert as WalletAlertWithWallet).watchedWallet?.label ?? short;
        const txUrl = `https://solscan.io/tx/${tx.signature}`;
        const walletTrackerUrl = `/wallet-tracker`;
        let type: NotificationEventType;
        let title: string;
        let message: string;
        let zaloText: string;
        let extraMeta: NotificationMetadata = {};

        const zaloHeader = `WalletTracker:\nFrom: ${walletLabel} (${alert.walletAddress})`;

        switch (alert.alertType) {
            case WalletAlertType.ANY_SWAP: {
                const { mintIn, mintOut, amountIn, amountOut, dex } = this.extractSwapMints(tx, alert.walletAddress);

                const [metaIn, metaOut] = await Promise.all([
                    mintIn ? this.tokenService.findOne(mintIn) : Promise.resolve(undefined),
                    mintOut ? this.tokenService.findOne(mintOut) : Promise.resolve(undefined)
                ]);

                const symbolIn = metaIn?.symbol;
                const symbolOut = metaOut?.symbol;
                const nameIn = metaIn?.name;
                const nameOut = metaOut?.name;
                const logoIn = metaIn?.logo_uri;
                const logoOut = metaOut?.logo_uri;

                type = NotificationEventType.SWAP_EXECUTED;

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

                zaloText = [
                    zaloHeader,
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
                const meta = mint ? await this.tokenService.findOne(mint) : undefined;
                const sym = meta?.symbol ?? alert.condition?.tokenSymbol ?? "Token";
                const cond = alert.condition;
                type = NotificationEventType.PRICE_ALERT_TRIGGERED;
                title = `${sym} balance changed`;
                message = `${sym} balance changed · ${walletLabel}`;

                zaloText = [
                    zaloHeader,
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
                const solMeta = await this.tokenService.findOne(COMMON_TOKEN_MINT.SOL);
                type = NotificationEventType.TRANSACTION_CONFIRMED;
                title = `${direction} ${this.fmt(totalSol)} SOL`;
                message = `${direction} ${this.fmt(totalSol)} SOL · ${walletLabel}`;

                const counterpart = direction === "Received" ? from : to;
                const counterShort = counterpart ? `${counterpart.slice(0, 6)}...${counterpart.slice(-4)}` : undefined;
                zaloText = [
                    zaloHeader,
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

        const emailHtml = zaloText
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

        await this.zaloSubscriptionService.sendAlertMessage(alert.userId, zaloText);
        await this.emailSubscriptionService.sendWalletAlertEmail(alert.userId, title, title, emailHtml, zaloText);
    }
}

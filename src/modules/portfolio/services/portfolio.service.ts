import { Injectable, Inject, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WalletsService } from "../../wallets/services/wallets.service";
import { HeliusResolver } from "../../../infra/solana/helius.resolver";
import { SolanaService } from "../../../infra/solana/solana.service";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import axios from "axios";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { Transaction, TransactionType, TransactionStatus } from "../../transactions/entities/transaction.entity";
import { WalletSnapshot } from "../entities/wallet-snapshot.entity";
import { TokensService } from "../../tokens/services/tokens.service";
import { TokenMetadata } from "../../tokens/dtos/token.response.dto";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { PortfolioPositionResponseDto, PortfolioPositionsResponseDto } from "../dtos/portfolio-position.response.dto";
import { COMMON_TOKEN_MINT } from "../../tokens/constants/token.constant";
import { ParsedTokenAccount } from "../../../infra/solana/solana.types";
import {
    ActivityApp,
    ActivityToken,
    AggregatedTokenHolding,
    AllocationItem,
    OverviewToken,
    PortfolioActivity,
    PortfolioTrade,
    TransactionInsertParam,
    TransactionInsertRow
} from "../types";
import { EnhancedTransaction, NativeTransfer, TokenTransfer } from "../../../infra/solana/constants/types";
import { Wallet } from "../../wallets/entities/wallet.entity";
import { TokenPriceService } from "src/modules/tokens/services/token-price.service";

const DEX_SOURCES = ["JUPITER", "RAYDIUM", "ORCA", "METEORA", "PHOENIX", "OPENBOOK", "SOLFI"];

@Injectable()
export class PortfolioService {
    private readonly logger = new Logger(PortfolioService.name);
    private readonly heliusRateLimitRps = 5;
    private heliusRequestTimestamps: number[] = [];

    constructor(
        private readonly walletsService: WalletsService,
        private readonly heliusResolver: HeliusResolver,
        private readonly solanaService: SolanaService,
        private readonly tokenService: TokensService,
        private readonly tokenPriceService: TokenPriceService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache,
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        @InjectRepository(WalletSnapshot)
        private readonly walletSnapshotRepository: Repository<WalletSnapshot>
    ) {}

    private mapTxType(heliusType: string): TransactionType {
        switch (heliusType) {
            case "SWAP":
                return TransactionType.SWAP;
            case "TRANSFER":
                return TransactionType.TRANSFER;
            case "STAKE_SOL":
            case "STAKE":
                return TransactionType.STAKE;
            case "UNSTAKE_SOL":
            case "UNSTAKE":
                return TransactionType.UNSTAKE;
            default:
                return TransactionType.SWAP;
        }
    }

    private async rateLimitedHeliusCall<T>(fn: () => Promise<T>): Promise<T> {
        const windowMs = 1000;
        const now = Date.now();
        this.heliusRequestTimestamps = this.heliusRequestTimestamps.filter((ts) => now - ts < windowMs);
        if (this.heliusRequestTimestamps.length >= this.heliusRateLimitRps) {
            const oldest = this.heliusRequestTimestamps[0];
            const waitMs = windowMs - (now - oldest) + 10;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        this.heliusRequestTimestamps.push(Date.now());
        return fn();
    }

    private getStoredTokenTransfers(metadata: Transaction["metadata"]): TokenTransfer[] {
        const stored = metadata as { tokenTransfers?: TokenTransfer[] } | null;
        return stored?.tokenTransfers ?? [];
    }

    private nativeTransferToTokenTransfer(transfer: NativeTransfer): TokenTransfer {
        return {
            fromUserAccount: transfer.fromUserAccount,
            toUserAccount: transfer.toUserAccount,
            fromTokenAccount: "",
            toTokenAccount: "",
            mint: COMMON_TOKEN_MINT.SOL,
            tokenAmount: transfer.amount / LAMPORTS_PER_SOL
        };
    }

    private async insertTransactionsIgnore(rows: TransactionInsertRow[]): Promise<void> {
        if (rows.length === 0) return;

        const columns = [
            "signature",
            "network",
            "type",
            "status",
            "amount",
            '"amountOut"',
            '"tokenMint"',
            '"tokenMintOut"',
            '"signerAddress"',
            '"blockNumber"',
            '"blockTime"',
            "memo",
            "metadata"
        ];
        const params: TransactionInsertParam[] = [];
        const values = rows
            .map((row, rowIndex) => {
                const offset = rowIndex * columns.length;
                params.push(
                    row.signature,
                    row.network,
                    row.type,
                    row.status,
                    row.amount,
                    row.amountOut ?? null,
                    row.tokenMint ?? null,
                    row.tokenMintOut ?? null,
                    row.signerAddress,
                    row.blockNumber ?? null,
                    row.blockTime,
                    row.memo,
                    row.metadata ? JSON.stringify(row.metadata) : null
                );
                return `(${columns.map((_, columnIndex) => `$${offset + columnIndex + 1}`).join(", ")})`;
            })
            .join(", ");

        await this.transactionRepository.query(
            `INSERT INTO transactions (${columns.join(", ")}) VALUES ${values} ON CONFLICT ("signature", "network") DO NOTHING`,
            params
        );
    }

    private getSolPriceNear(timestampSec: number, priceChart: Map<number, number>): number {
        const dayTs = Math.floor(timestampSec / 86400) * 86400;
        if (priceChart.has(dayTs)) return priceChart.get(dayTs)!;
        // fallback: giá mới nhất trong chart
        let latest = 0;
        for (const [ts, price] of priceChart) {
            if (ts > dayTs) break;
            latest = price;
        }
        return latest;
    }

    private async getAvgHistoricalSolPrice(cluster: Cluster, trades: PortfolioTrade[], fallback: number): Promise<number> {
        if (trades.length === 0) return fallback;
        const timestamps = trades.map((t) => t.timestamp);
        const minTs = Math.min(...timestamps);
        const maxTs = Math.max(...timestamps);
        const priceChart = await this.tokenPriceService.getPriceHistory(cluster, COMMON_TOKEN_MINT.SOL, minTs, maxTs);
        if (priceChart.size === 0) return fallback;
        const prices = Array.from(priceChart.values());
        return prices.reduce((a, b) => a + b, 0) / prices.length;
    }

    async getOverview(cluster: Cluster, userId: string, walletAddresses?: string[], _timeFrame?: string) {
        let wallets = await this.walletsService.findByUserId(userId);

        if (walletAddresses && walletAddresses.length > 0) {
            wallets = wallets.filter((w) => walletAddresses.includes(w.address));
        }

        const tokenAccountGroups: ParsedTokenAccount[][] = await Promise.all(
            wallets.map((wallet) => this.solanaService.getParsedTokenAccountsByOwner(cluster, new PublicKey(wallet.address)))
        );
        const allTokenAccounts: ParsedTokenAccount[] = tokenAccountGroups.reduce((accumulator, group) => accumulator.concat(group), [] as ParsedTokenAccount[]);

        const solPrice = await this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL);

        const total_balance_sol = wallets.reduce((acc, w) => acc + Number(w.balance || 0), 0);
        let total_balance_usd = total_balance_sol * solPrice.priceUsd;

        const aggregatedTokens = new Map<string, AggregatedTokenHolding>();

        for (const acc of allTokenAccounts) {
            const parsedInfo = acc.account.data.parsed.info;
            const mint = parsedInfo.mint;
            const tokenAmount = parsedInfo.tokenAmount;
            const amount = tokenAmount.uiAmount ?? 0;
            if (amount > 0) {
                const existing = aggregatedTokens.get(mint) || { amount: 0, decimals: tokenAmount.decimals };
                aggregatedTokens.set(mint, {
                    amount: existing.amount + amount,
                    decimals: existing.decimals
                });
            }
        }

        const mintAddresses = Array.from(aggregatedTokens.keys());
        const tokenMetaMap = await this.tokenService.findMany(cluster, mintAddresses);

        for (const [mint, data] of aggregatedTokens) {
            data.info = tokenMetaMap.get(mint);
        }

        const tokenPrices = await this.tokenPriceService.getPrices(cluster, mintAddresses);

        const positions = Array.from(aggregatedTokens.entries()).map(([mint, data]) => {
            const price = tokenPrices.get(mint);
            const valueUsd = data.amount * (price?.priceUsd ?? 0);
            return {
                mint,
                ...data.info,
                decimals: data.decimals,
                amount: data.amount,
                price,
                valueUsd
            };
        });

        positions.forEach((p) => (total_balance_usd += p.valueUsd));

        positions.sort((a, b) => b.valueUsd - a.valueUsd);

        const top_tokens = positions.slice(0, 5).map((p) => ({
            name: p.name || "Unknown",
            symbol: p.symbol || "???",
            logo: p.logoUri || "",
            decimals: p.decimals,
            value_usd: p.valueUsd,
            price: p.price,
            change_24h: 0 // Placeholder
        }));

        const allocation = positions.map((p) => ({
            name: p.name || "Unknown",
            symbol: p.symbol || "???",
            value_usd: p.valueUsd,
            percentage: total_balance_usd > 0 ? (p.valueUsd / total_balance_usd) * 100 : 0
        }));

        // Add SOL to allocation
        const solValueUsd = total_balance_sol * solPrice.priceUsd;
        if (solValueUsd > 0) {
            allocation.push({
                name: "Solana",
                symbol: "SOL",
                value_usd: solValueUsd,
                percentage: total_balance_usd > 0 ? (solValueUsd / total_balance_usd) * 100 : 0
            });
        }
        allocation.sort((a, b) => b.value_usd - a.value_usd);

        const [transactionStats, trades] = await Promise.all([this.getTransactionStats(cluster, wallets), this.fetchAllTrades(cluster, wallets)]);

        const pnlMap = this.calculatePnl(trades);

        const avgHistoricalSolPrice = await this.getAvgHistoricalSolPrice(cluster, trades, solPrice.priceUsd);

        const realized_usd = Array.from(pnlMap.values()).reduce((acc, r) => acc + r.pnl * avgHistoricalSolPrice, 0);

        const unrealized_usd = Array.from(pnlMap.entries()).reduce((acc, [mint, r]) => {
            if (r.totalTokensBought <= 0) return acc;
            const currentPrice = tokenPrices.get(mint)?.priceUsd ?? 0;
            const currentValue = r.totalTokensBought * currentPrice;
            const costBasisUsd = r.totalSolSpent * solPrice.priceUsd;
            return acc + (currentValue - costBasisUsd);
        }, 0);

        const total_pnl = realized_usd + unrealized_usd;
        const total_investment_usd = Array.from(pnlMap.values()).reduce((acc, r) => acc + r.investment * solPrice.priceUsd, 0);
        const roi_percent = total_investment_usd > 0 ? (total_pnl / total_investment_usd) * 100 : 0;

        return {
            total_balance_usd,
            total_balance_sol,
            balance_change_24h: 0,
            pnl: {
                total: total_pnl,
                realized: realized_usd,
                unrealized: unrealized_usd,
                change_24h: 0,
                roi_percent
            },
            transactions: transactionStats,
            top_tokens,
            allocation
        };
    }

    async getPnlChart(cluster: Cluster, userId: string, walletAddresses: string[], timeFrame: string, interval: string) {
        const now = Date.now();
        let startTime = now;
        let intervalMs = 24 * 60 * 60 * 1000;

        switch (timeFrame) {
            case "7d":
                startTime = now - 7 * 24 * 60 * 60 * 1000;
                break;
            case "30d":
                startTime = now - 30 * 24 * 60 * 60 * 1000;
                break;
            case "90d":
                startTime = now - 90 * 24 * 60 * 60 * 1000;
                break;
            case "1y":
                startTime = now - 365 * 24 * 60 * 60 * 1000;
                break;
            case "all":
                startTime = now - 2 * 365 * 24 * 60 * 60 * 1000;
                break;
            default:
                startTime = now - 7 * 24 * 60 * 60 * 1000;
        }

        switch (interval) {
            case "1h":
                intervalMs = 60 * 60 * 1000;
                break;
            case "1d":
                intervalMs = 24 * 60 * 60 * 1000;
                break;
            case "1w":
                intervalMs = 7 * 24 * 60 * 60 * 1000;
                break;
        }

        let wallets = await this.walletsService.findByUserId(userId);
        if (walletAddresses && walletAddresses.length > 0) {
            wallets = wallets.filter((w) => walletAddresses.includes(w.address));
        }
        if (wallets.length === 0) {
            return { chart_data: [] };
        }

        const pnlCacheKey = `pnl_chart:${cluster}:${wallets
            .map((w) => w.address)
            .sort()
            .join(",")}:${timeFrame}:${interval}`;
        const pnlCached = await this.cacheManager.get<{ chart_data: { timestamp: number; pnl: number; balance_usd: number }[] }>(pnlCacheKey);
        if (pnlCached) return pnlCached;

        const TWO_YEARS_SEC = 2 * 365 * 24 * 60 * 60;
        const cutoffSec = Math.floor(now / 1000) - TWO_YEARS_SEC;
        const startTimeSec = Math.floor(startTime / 1000);

        // Ensure each wallet has data in DB; if empty, trigger a sync via fetchWalletActivities
        for (const wallet of wallets) {
            const count = await this.transactionRepository.count({
                where: { signerAddress: wallet.address, type: TransactionType.SWAP, network: cluster }
            });
            if (count === 0) {
                await this.fetchWalletActivities(cluster, wallet.address, "all", 100);
            }
        }

        // Read swaps directly from DB, filtered to timeframe
        const dbTrades = await this.transactionRepository
            .createQueryBuilder("t")
            .where("t.signerAddress IN (:...addrs)", {
                addrs: wallets.map((w) => w.address)
            })
            .andWhere("t.network = :network", { network: cluster })
            .andWhere("t.type = :type", { type: TransactionType.SWAP })
            .andWhere("t.blockTime >= :start", { start: new Date(startTimeSec * 1000) })
            .andWhere("t.blockTime >= :cutoff", { cutoff: new Date(cutoffSec * 1000) })
            .orderBy("t.blockTime", "ASC")
            .getMany();

        const filteredTrades = dbTrades.map((row) => ({
            signature: row.signature,
            timestamp: row.blockTime ? Math.floor(row.blockTime.getTime() / 1000) : 0,
            type: "SWAP",
            tokenTransfers: this.getStoredTokenTransfers(row.metadata),
            description: row.memo
        }));
        // Fetch historical SOL prices for the chart range
        const historyFrom = filteredTrades.length > 0 ? filteredTrades[0].timestamp : startTimeSec;
        const historyTo = Math.floor(now / 1000);
        const solPriceChart = await this.tokenPriceService.getPriceHistory(cluster, COMMON_TOKEN_MINT.SOL, historyFrom, historyTo);

        // Single-pass: track cumulative realized PnL per interval using average cost basis
        const runningHoldings = new Map<string, { totalTokensBought: number; totalSolSpent: number }>();
        let cumulativePnlSol = 0;
        let tradeIndex = 0;

        const chartData: { timestamp: number; pnl: number; balance_usd: number }[] = [];

        for (let time = startTime; time <= now; time += intervalMs) {
            const timeSec = Math.floor(time / 1000);
            while (tradeIndex < filteredTrades.length && filteredTrades[tradeIndex].timestamp <= timeSec) {
                const trade = filteredTrades[tradeIndex++];
                if (trade.type !== "SWAP") continue;

                const tokenOut = trade.tokenTransfers.find((t) => t.fromUserAccount);
                const tokenIn = trade.tokenTransfers.find((t) => t.toUserAccount);
                if (!tokenOut || !tokenIn) continue;

                const isBuy = tokenIn.mint !== COMMON_TOKEN_MINT.SOL;
                const tokenMint = isBuy ? tokenIn.mint : tokenOut.mint;
                const solAmount = isBuy ? tokenOut.tokenAmount : tokenIn.tokenAmount;
                const tokenAmount = isBuy ? tokenIn.tokenAmount : tokenOut.tokenAmount;

                console.log("DEBUG", isBuy, tokenMint, solAmount, tokenAmount);
                if (!tokenMint || !solAmount || !tokenAmount) continue;

                const holding = runningHoldings.get(tokenMint) ?? {
                    totalTokensBought: 0,
                    totalSolSpent: 0
                };

                if (isBuy) {
                    holding.totalTokensBought += tokenAmount;
                    holding.totalSolSpent += solAmount;
                } else {
                    // Cost basis = 0 nếu không có buy được track (airdrop, buy trước 2 năm, v.v.)
                    const avgCost = holding.totalTokensBought > 0 ? holding.totalSolSpent / holding.totalTokensBought : 0;
                    const costOfGoodsSold = tokenAmount * avgCost;
                    cumulativePnlSol += solAmount - costOfGoodsSold;
                    holding.totalTokensBought = Math.max(0, holding.totalTokensBought - tokenAmount);
                    holding.totalSolSpent = Math.max(0, holding.totalSolSpent - costOfGoodsSold);
                }
                runningHoldings.set(tokenMint, holding);
            }

            const solPriceAtTime = this.getSolPriceNear(timeSec, solPriceChart);
            const pnlUsd = cumulativePnlSol * solPriceAtTime;
            chartData.push({ timestamp: time, pnl: pnlUsd, balance_usd: pnlUsd });
        }

        const pnlResult = { chart_data: chartData };
        await this.cacheManager.set(pnlCacheKey, pnlResult, 2 * 60 * 1000);
        return pnlResult;
    }

    async getPositions(
        cluster: Cluster,
        userId: string,
        walletAddress?: string,
        sortBy: string = "value_usd",
        showZeroBalance: boolean = false
    ): Promise<PortfolioPositionsResponseDto> {
        const wallets = await this.walletsService.findByUserId(userId);
        const targetWallets = walletAddress ? wallets.filter((w) => w.address === walletAddress) : wallets;

        if (targetWallets.length === 0) {
            return {
                positions: [],
                summary: { total_value_usd: 0, total_tokens: 0, total_pnl: 0 }
            };
        }

        const [solPrice, walletTokenAccounts] = await Promise.all([
            this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL),
            Promise.all(
                targetWallets.map(async (w) => ({
                    wallet: w,
                    accounts: await this.solanaService.getParsedTokenAccountsByOwner(cluster, new PublicKey(w.address))
                }))
            )
        ]);

        // Save per-wallet balance snapshots (fire-and-forget)
        const snapshotAt = new Date();
        const snapshotRepo = this.walletSnapshotRepository;
        const allSnapshotEntities = walletTokenAccounts.flatMap(({ wallet, accounts }) =>
            accounts
                .filter((acc) => (acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0) > 0)
                .map((acc) => {
                    const mint = acc.account.data.parsed.info.mint;
                    const amount = acc.account.data.parsed.info.tokenAmount.uiAmount ?? 0;
                    return snapshotRepo.create({ walletAddress: wallet.address, network: cluster, tokenMint: mint, amount, snapshotAt });
                })
        );
        if (allSnapshotEntities.length > 0) {
            await snapshotRepo.save(allSnapshotEntities).catch((err) => this.logger.error("Failed to save position snapshot:", err));
        }

        const allTokenAccounts = walletTokenAccounts.flatMap((w) => w.accounts);

        const aggregatedTokens = new Map<string, AggregatedTokenHolding>();

        for (const acc of allTokenAccounts) {
            const parsedInfo = acc.account.data.parsed.info;
            const mint = parsedInfo.mint;
            const tokenAmount = parsedInfo.tokenAmount;
            const amount = tokenAmount.uiAmount ?? 0;
            if (amount > 0 || showZeroBalance) {
                const existing = aggregatedTokens.get(mint) || { amount: 0, decimals: tokenAmount.decimals };
                aggregatedTokens.set(mint, {
                    amount: existing.amount + amount,
                    decimals: existing.decimals
                });
            }
        }

        const mintAddresses = Array.from(aggregatedTokens.keys());
        const tokenMetaMap = await this.tokenService.findMany(cluster, mintAddresses);

        for (const [mint, data] of aggregatedTokens) {
            data.info = tokenMetaMap.get(mint);
        }

        const tokenPrices = await this.tokenPriceService.getPrices(cluster, mintAddresses);

        const positions: PortfolioPositionResponseDto[] = Array.from(aggregatedTokens.entries()).map(([mint, data]) => {
            const price = tokenPrices.get(mint)?.priceUsd || 0;
            const valueUsd = data.amount * price;
            return {
                mint,
                name: data.info?.name || "Unknown Token",
                symbol: data.info?.symbol || "???",
                logo: data.info?.logoUri || "",
                decimals: data.decimals,
                amount: data.amount,
                price,
                value_usd: valueUsd,
                pnl: 0, // Placeholder
                pnl_percent: 0 // Placeholder
            };
        });

        const totalSolBalance = targetWallets.reduce((acc, w) => acc + Number(w.balance || 0), 0);
        const solValueUsd = totalSolBalance * solPrice.priceUsd;

        // Add SOL as a position
        if (totalSolBalance > 0 || showZeroBalance) {
            positions.push({
                ...this.defaultSolMeta(),
                amount: totalSolBalance,
                price: solPrice.priceUsd,
                value_usd: solValueUsd,
                pnl: 0, // Placeholder
                pnl_percent: 0 // Placeholder
            });
        }

        // Sorting
        switch (sortBy) {
            case "amount":
                positions.sort((a, b) => b.amount - a.amount);
                break;
            case "name":
                positions.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case "value_usd":
            default:
                positions.sort((a, b) => b.value_usd - a.value_usd);
                break;
        }

        const total_value_usd = positions.reduce((acc, p) => acc + p.value_usd, 0);

        return {
            positions,
            summary: {
                total_value_usd,
                total_tokens: positions.length,
                total_pnl: 0 // Placeholder
            }
        };
    }

    private async fetchWalletActivities(cluster: Cluster, walletAddress: string, type: string, limit: number, before?: string): Promise<EnhancedTransaction[]> {
        let heliusType = "";
        if (type === "buy" || type === "sell") {
            heliusType = "SWAP";
        } else if (type === "transfer") {
            heliusType = "TRANSFER";
        }

        try {
            let transactions = await this.rateLimitedHeliusCall(() =>
                this.heliusResolver.forCluster(cluster).getEnhancedTransactionsByAddress(walletAddress, {
                    limit,
                    type: heliusType || undefined,
                    beforeSignature: before
                })
            );

            // Save detected swaps/transfers to DB so PnL can use them
            const swapsToSave = transactions.filter((tx) => this.isSwap(tx, walletAddress));
            if (swapsToSave.length > 0) {
                const entities: TransactionInsertRow[] = swapsToSave.map((tx) => {
                    const allTransfers = [...(tx.tokenTransfers ?? []), ...(tx.nativeTransfers ?? []).map((nt) => this.nativeTransferToTokenTransfer(nt))];
                    const tokenOut = allTransfers.find((t) => t.fromUserAccount === walletAddress);
                    const tokenIn = allTransfers.find((t) => t.toUserAccount === walletAddress);
                    const metadata: Transaction["metadata"] = { tokenTransfers: allTransfers };
                    return {
                        signature: tx.signature,
                        network: cluster,
                        type: this.mapTxType(tx.type),
                        status: TransactionStatus.CONFIRMED,
                        amount: tokenOut?.tokenAmount ?? 0,
                        amountOut: tokenIn?.tokenAmount,
                        tokenMint: tokenOut?.mint,
                        tokenMintOut: tokenIn?.mint,
                        signerAddress: walletAddress,
                        blockTime: new Date(tx.timestamp * 1000),
                        memo: tx.description ?? null,
                        metadata
                    };
                });
                try {
                    await this.insertTransactionsIgnore(entities);
                } catch {
                    /* ignore */
                }
            }

            if (type === "buy") {
                transactions = transactions.filter((tx) => {
                    if (tx.type !== "SWAP" && !(tx.type === "UNKNOWN" && DEX_SOURCES.includes(tx.source))) return false;
                    return !tx.tokenTransfers.find((t) => t.fromUserAccount === walletAddress);
                });
            } else if (type === "sell") {
                transactions = transactions.filter((tx) => {
                    if (tx.type !== "SWAP" && !(tx.type === "UNKNOWN" && DEX_SOURCES.includes(tx.source))) return false;
                    return !!tx.tokenTransfers.find((t) => t.fromUserAccount === walletAddress);
                });
            }

            return transactions;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return [];
            }
            console.error(`Failed to fetch activities for ${walletAddress}`);
            return [];
        }
    }

    private formatSourceName(source: string): string {
        if (!source || source === "UNKNOWN") return "Unknown";
        return source.charAt(0) + source.slice(1).toLowerCase().replace(/_/g, " ");
    }

    private async mapToActivity(
        cluster: Cluster,
        tx: EnhancedTransaction,
        walletAddress: string,
        solPrice: number,
        _tokenMetaMap: Map<string, TokenMetadata>
    ): Promise<PortfolioActivity | null> {
        const feeSol = tx.fee ? tx.fee / LAMPORTS_PER_SOL : 0;
        const feeUsd = feeSol * solPrice;

        const txUrl = cluster === "devnet" ? `https://solscan.io/tx/${tx.signature}?cluster=devnet` : `https://solscan.io/tx/${tx.signature}`;

        const isDexSwap = tx.type === "SWAP" || (tx.type === "UNKNOWN" && DEX_SOURCES.includes(tx.source));

        let app: ActivityApp = {
            name: this.formatSourceName(tx.source),
            type: isDexSwap ? "DEX" : "PROGRAM",
            icon: ""
        };

        const status: "success" | "failed" = tx.transactionError ? "failed" : "success";

        const tags: string[] = [tx.type].filter(Boolean);
        if (tx.source && tx.source !== "UNKNOWN") tags.push(tx.source);

        let type: string = isDexSwap ? "SWAP" : tx.type;
        let token_in: ActivityToken | undefined;
        let token_out: ActivityToken | undefined;
        let token: ActivityToken | undefined;
        let from: string | undefined;
        let to: string | undefined;

        if (isDexSwap) {
            const swapEvent = tx.events?.swap;
            if (swapEvent) {
                if (swapEvent.nativeInput) {
                    const amount = Number(swapEvent.nativeInput.amount) / LAMPORTS_PER_SOL;
                    token_in = {
                        address: COMMON_TOKEN_MINT.SOL,
                        symbol: "SOL",
                        logo_uri: (await this.tokenService.getTokenMetadata(cluster, COMMON_TOKEN_MINT.SOL))?.logoUri ?? "",
                        amount,
                        value_usd: amount * solPrice
                    };
                } else if (swapEvent.tokenInputs?.[0]) {
                    const inp = swapEvent.tokenInputs[0];
                    const amount = parseFloat(inp.rawTokenAmount?.tokenAmount ?? "0");
                    const tokenMeta = await this.tokenService.findOne(cluster, inp.mint);
                    token_in = {
                        address: inp.mint,
                        symbol: tokenMeta?.symbol,
                        logo_uri: tokenMeta?.logo_uri,
                        amount,
                        value_usd: 0
                    };
                }

                if (swapEvent.nativeOutput) {
                    const amount = Number(swapEvent.nativeOutput.amount) / LAMPORTS_PER_SOL;
                    token_out = {
                        address: COMMON_TOKEN_MINT.SOL,
                        symbol: "SOL",
                        logo_uri: (await this.tokenService.getTokenMetadata(cluster, COMMON_TOKEN_MINT.SOL))?.logoUri ?? "",
                        amount,
                        value_usd: amount * solPrice
                    };
                } else if (swapEvent.tokenOutputs?.[0]) {
                    const out = swapEvent.tokenOutputs[0];
                    const amount = parseFloat(out.rawTokenAmount?.tokenAmount ?? "0");
                    const tokenMeta = await this.tokenService.findOne(cluster, out.mint);
                    token_out = {
                        address: out.mint,
                        symbol: tokenMeta?.symbol,
                        logo_uri: tokenMeta?.logo_uri,
                        amount,
                        value_usd: 0
                    };
                }
            } else {
                const sold = (tx.tokenTransfers ?? []).find((t) => t.fromUserAccount === walletAddress);
                const bought = (tx.tokenTransfers ?? []).find((t) => t.toUserAccount === walletAddress);
                if (sold) {
                    const inMeta = await this.tokenService.findOne(cluster, sold.mint);
                    token_in = {
                        address: sold.mint,
                        symbol: inMeta?.symbol,
                        logo_uri: inMeta?.logo_uri,
                        amount: sold.tokenAmount,
                        value_usd: 0
                    };
                }
                if (bought) {
                    const outMeta = await this.tokenService.findOne(cluster, bought.mint);

                    token_out = {
                        address: bought.mint,
                        symbol: outMeta?.symbol,
                        logo_uri: outMeta?.logo_uri,
                        amount: bought.tokenAmount,
                        value_usd: 0
                    };
                }
            }
        } else if (tx.type === "TRANSFER") {
            // Only show transfers where the user's wallet is the direct sender or receiver.
            // Intermediate routing hops (program accounts as from/to) are filtered out as noise.
            const allXfers = [...(tx.tokenTransfers ?? []), ...(tx.nativeTransfers ?? [])];
            const isDirectlyInvolved = allXfers.some((t) => t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress);
            if (!isDirectlyInvolved) return null;

            // Implicit swap detection: Jupiter multi-hop routes sometimes surface as TRANSFER
            // when SOL + token transfers appear in the same tx (e.g. SOL→USDT→MEDIA).
            const implicitTokenIn = (tx.tokenTransfers ?? []).find((t) => t.toUserAccount === walletAddress);
            const implicitTokenOut = (tx.tokenTransfers ?? []).find((t) => t.fromUserAccount === walletAddress);
            const implicitSolOut = (tx.nativeTransfers ?? []).find((t) => t.fromUserAccount === walletAddress && t.amount >= 1000);
            const implicitSolIn = (tx.nativeTransfers ?? []).find((t) => t.toUserAccount === walletAddress && t.amount >= 1000);

            // Fallback: check accountData.tokenBalanceChanges for tokens received by the wallet
            // (Helius omits them from tokenTransfers for some Jupiter multi-hop routes)
            let accountDataTokenIn: { mint: string; tokenAmount: number } | undefined;
            let accountDataTokenOut: { mint: string; tokenAmount: number } | undefined;
            const walletAccountData = (tx.accountData ?? []).find((d) => d.account === walletAddress);
            if (walletAccountData?.tokenBalanceChanges) {
                for (const c of walletAccountData.tokenBalanceChanges) {
                    const rawAmt = parseFloat(c.rawTokenAmount?.tokenAmount ?? "0");
                    const decimals: number = c.rawTokenAmount?.decimals ?? 0;
                    const amount = rawAmt / Math.pow(10, decimals);
                    if (rawAmt > 0 && !implicitTokenIn) {
                        accountDataTokenIn = { mint: c.mint, tokenAmount: amount };
                    } else if (rawAmt < 0 && !implicitTokenOut) {
                        accountDataTokenOut = { mint: c.mint, tokenAmount: Math.abs(amount) };
                    }
                }
            }

            const effectiveTokenIn =
                implicitTokenIn ??
                (accountDataTokenIn ? { toUserAccount: walletAddress, mint: accountDataTokenIn.mint, tokenAmount: accountDataTokenIn.tokenAmount } : undefined);
            const effectiveTokenOut =
                implicitTokenOut ??
                (accountDataTokenOut
                    ? { fromUserAccount: walletAddress, mint: accountDataTokenOut.mint, tokenAmount: accountDataTokenOut.tokenAmount }
                    : undefined);

            const isImplicitSwap =
                (implicitSolOut && effectiveTokenIn) || // SOL → token  (buy)
                (effectiveTokenOut && effectiveTokenIn) || // token → token
                (effectiveTokenOut && implicitSolIn); // token → SOL  (sell)

            if (isImplicitSwap) {
                type = "SWAP";
                app = {
                    name: tx.source && tx.source !== "SYSTEM_PROGRAM" && tx.source !== "UNKNOWN" ? this.formatSourceName(tx.source) : "Jupiter",
                    type: "DEX",
                    icon: ""
                };

                if (effectiveTokenOut) {
                    const meta = await this.tokenService.findOne(cluster, effectiveTokenOut.mint);
                    token_in = {
                        address: effectiveTokenOut.mint,
                        symbol: meta?.symbol,
                        logo_uri: meta?.logo_uri,
                        amount: effectiveTokenOut.tokenAmount,
                        value_usd: 0
                    };
                } else if (implicitSolOut) {
                    const amt = implicitSolOut.amount / LAMPORTS_PER_SOL;
                    token_in = {
                        address: COMMON_TOKEN_MINT.SOL,
                        symbol: "SOL",
                        logo_uri: (await this.tokenService.getTokenMetadata(cluster, COMMON_TOKEN_MINT.SOL))?.logoUri ?? "",
                        amount: amt,
                        value_usd: amt * solPrice
                    };
                }

                if (effectiveTokenIn) {
                    const meta = await this.tokenService.findOne(cluster, effectiveTokenIn.mint);
                    token_out = {
                        address: effectiveTokenIn.mint,
                        symbol: meta?.symbol,
                        logo_uri: meta?.logo_uri,
                        amount: effectiveTokenIn.tokenAmount,
                        value_usd: 0
                    };
                } else if (implicitSolIn) {
                    const amt = implicitSolIn.amount / LAMPORTS_PER_SOL;
                    token_out = {
                        address: COMMON_TOKEN_MINT.SOL,
                        symbol: "SOL",
                        logo_uri: (await this.tokenService.getTokenMetadata(cluster, COMMON_TOKEN_MINT.SOL))?.logoUri ?? "",
                        amount: amt,
                        value_usd: amt * solPrice
                    };
                }
            } else {
                // Normal transfer: pick the transfer directly involving the wallet
                const tokenTransfer =
                    (tx.tokenTransfers ?? []).find((t) => t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress) ??
                    (tx.tokenTransfers ?? [])[0];
                const nativeTransfer = (tx.nativeTransfers ?? []).find((t) => t.fromUserAccount === walletAddress || t.toUserAccount === walletAddress) ?? null;

                // Filter dust: native SOL transfers < 1000 lamports are ATA rent noise
                if (!tokenTransfer && nativeTransfer && nativeTransfer.amount < 1000) return null;

                const xfer = tokenTransfer ?? nativeTransfer;
                if (xfer) {
                    from = xfer.fromUserAccount;
                    to = xfer.toUserAccount;
                    type = xfer.toUserAccount === walletAddress ? "TRANSFER_IN" : "TRANSFER_OUT";
                    if (tokenTransfer) {
                        const meta = await this.tokenService.findOne(cluster, tokenTransfer.mint);
                        token = {
                            address: tokenTransfer.mint,
                            symbol: meta?.symbol,
                            logo_uri: meta?.logo_uri,
                            amount: tokenTransfer.tokenAmount,
                            value_usd: 0
                        };
                    } else if (nativeTransfer) {
                        const amount = nativeTransfer.amount / LAMPORTS_PER_SOL;
                        token = {
                            address: COMMON_TOKEN_MINT.SOL,
                            symbol: "SOL",
                            logo_uri: (await this.tokenService.getTokenMetadata(cluster, COMMON_TOKEN_MINT.SOL))?.logoUri ?? "",
                            amount,
                            value_usd: amount * solPrice
                        };
                    }
                }
            }
        } else if (tx.type === "STAKE_SOL" || tx.type === "STAKE") {
            type = "STAKE";
            const nativeTransfer = (tx.nativeTransfers ?? [])[0];
            if (nativeTransfer) {
                const amount = nativeTransfer.amount / LAMPORTS_PER_SOL;
                token = {
                    address: COMMON_TOKEN_MINT.SOL,
                    symbol: "SOL",
                    logo_uri: (await this.tokenService.getTokenMetadata(cluster, COMMON_TOKEN_MINT.SOL))?.logoUri ?? "",
                    amount,
                    value_usd: amount * solPrice
                };
            }
        } else if (tx.type === "UNSTAKE_SOL" || tx.type === "UNSTAKE") {
            type = "UNSTAKE";
            const nativeTransfer = (tx.nativeTransfers ?? [])[0];
            if (nativeTransfer) {
                const amount = nativeTransfer.amount / LAMPORTS_PER_SOL;
                token = {
                    address: COMMON_TOKEN_MINT.SOL,
                    symbol: "SOL",
                    logo_uri: (await this.tokenService.getTokenMetadata(cluster, COMMON_TOKEN_MINT.SOL))?.logoUri ?? "",
                    amount,
                    value_usd: amount * solPrice
                };
            }
        }

        return {
            tx_hash: tx.signature,
            type,
            timestamp: tx.timestamp,
            status,
            app,
            ...(token_in && { token_in }),
            ...(token_out && { token_out }),
            ...(token && { token }),
            ...(from && { from }),
            ...(to && { to }),
            wallet: walletAddress,
            wallet_icon: "",
            tags,
            fee_sol: feeSol,
            fee_usd: feeUsd,
            tx_url: txUrl
        };
    }

    async getActivities(
        cluster: Cluster,
        userId: string,
        walletAddress?: string,
        type: string = "all",
        limit: number = 20,
        before?: string,
        from?: number,
        to?: number
    ) {
        const [userWallets, solPrice] = await Promise.all([
            this.walletsService.findByUserId(userId),
            this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL)
        ]);

        let targetAddresses: string[];
        if (walletAddress) {
            const owned = userWallets.find((w) => w.address === walletAddress);
            if (!owned)
                return {
                    activities: [],
                    total: 0,
                    summary: { total_volume_usd: 0, total_fees_usd: 0 }
                };
            targetAddresses = [walletAddress];
        } else {
            if (userWallets.length === 0)
                return {
                    activities: [],
                    total: 0,
                    summary: { total_volume_usd: 0, total_fees_usd: 0 }
                };
            targetAddresses = userWallets.map((w) => w.address);
        }

        const results = await Promise.all(
            targetAddresses.map(async (addr) => {
                const txs = await this.fetchWalletActivities(cluster, addr, type, limit, walletAddress ? before : undefined);
                return txs.map((tx) => ({ tx, addr }));
            })
        );

        // Sort by timestamp desc and slice
        let flat = results.flat();
        flat.sort((a, b) => (b.tx.timestamp ?? 0) - (a.tx.timestamp ?? 0));

        // Filter by time range if provided (Unix timestamps in seconds)
        if (from) flat = flat.filter(({ tx }) => (tx.timestamp ?? 0) >= Number(from));
        if (to) flat = flat.filter(({ tx }) => (tx.timestamp ?? 0) <= Number(to));

        const sliced = flat.slice(0, limit);

        // Collect unique mints from transactions for metadata lookup
        const uniqueMints = new Set<string>();
        for (const { tx } of sliced) {
            for (const transfer of tx.tokenTransfers ?? []) {
                if (transfer.mint) uniqueMints.add(transfer.mint);
            }
        }
        const tokenMetaMap = await this.tokenService.findMany(cluster, Array.from(uniqueMints));

        const mappedActivities = await Promise.all(sliced.map(({ tx, addr }) => this.mapToActivity(cluster, tx, addr, solPrice.priceUsd, tokenMetaMap)));
        const activities = mappedActivities.filter((a): a is PortfolioActivity => a !== null);

        await this.enrichActivitiesWithSwapDetails(cluster, activities, tokenMetaMap);

        const total_fees_usd = activities.reduce((acc, a) => acc + a.fee_usd, 0);

        return {
            activities,
            total: activities.length,
            summary: {
                total_volume_usd: 0,
                total_fees_usd
            }
        };
    }

    async getPerformance(
        cluster: Cluster,
        userId: string,
        walletAddresses: string[],
        _timeFrame: string // TODO: filter fetchAllTrades by timeFrame (currently fetches last 100 per wallet)
    ) {
        let wallets = await this.walletsService.findByUserId(userId);
        if (walletAddresses && walletAddresses.length > 0) {
            wallets = wallets.filter((w) => walletAddresses.includes(w.address));
        }
        if (wallets.length === 0) {
            return this.getEmptyPerformance();
        }

        const [trades, solPrice] = await Promise.all([this.fetchAllTrades(cluster, wallets), this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL)]);

        const pnlMap = this.calculatePnl(trades);

        if (pnlMap.size === 0) {
            return this.getEmptyPerformance();
        }

        // Use avg historical SOL price over the trade period for realized PnL USD conversion
        const avgHistoricalSolPrice = await this.getAvgHistoricalSolPrice(cluster, trades, solPrice.priceUsd);

        const tokenPerformance = Array.from(pnlMap.values()).map((record) => {
            const pnl = record.pnl * avgHistoricalSolPrice;
            const investmentUsd = record.investment * solPrice.priceUsd;
            const roi_percent = investmentUsd > 0 ? (pnl / investmentUsd) * 100 : 0;
            return {
                token: record.symbol,
                symbol: record.symbol,
                pnl,
                roi_percent
            };
        });

        tokenPerformance.sort((a, b) => b.pnl - a.pnl);

        const top_performers = tokenPerformance.slice(0, 3);
        const worst_performers = tokenPerformance.slice(-3).reverse();

        const total_pnl = tokenPerformance.reduce((acc, t) => acc + t.pnl, 0);
        const total_investment_usd = Array.from(pnlMap.values()).reduce((acc, r) => acc + r.investment * solPrice.priceUsd, 0);
        const total_roi_percent = total_investment_usd > 0 ? (total_pnl / total_investment_usd) * 100 : 0;

        const winning_trades = tokenPerformance.filter((t) => t.pnl > 0).length;
        const win_rate = tokenPerformance.length > 0 ? (winning_trades / tokenPerformance.length) * 100 : 0;

        const best_trade = top_performers[0] || {
            token: "",
            pnl: 0,
            roi_percent: 0
        };
        const worst_trade = worst_performers[0] || {
            token: "",
            pnl: 0,
            roi_percent: 0
        };

        return {
            performance: {
                total_pnl,
                total_roi_percent,
                win_rate,
                best_trade: {
                    token: best_trade.token,
                    pnl: best_trade.pnl,
                    roi_percent: best_trade.roi_percent
                },
                worst_trade: {
                    token: worst_trade.token,
                    pnl: worst_trade.pnl,
                    roi_percent: worst_trade.roi_percent
                }
            },
            top_performers,
            worst_performers
        };
    }

    private getEmptyPerformance() {
        return {
            performance: {
                total_pnl: 0,
                total_roi_percent: 0,
                win_rate: 0,
                best_trade: { token: "", pnl: 0, roi_percent: 0 },
                worst_trade: { token: "", pnl: 0, roi_percent: 0 }
            },
            top_performers: [],
            worst_performers: []
        };
    }

    private isSwap(tx: EnhancedTransaction, walletAddress: string): boolean {
        if (tx.type === "SWAP" || tx.type === "TRANSFER") return true;
        if (tx.events?.swap) return true;
        const transfers = tx.tokenTransfers ?? [];
        const sent = transfers.find((t) => t.fromUserAccount === walletAddress);
        const received = transfers.find((t) => t.toUserAccount === walletAddress);
        return !!(sent && received && sent.mint !== received.mint);
    }

    private async fetchAllTrades(cluster: Cluster, wallets: Wallet[]): Promise<PortfolioTrade[]> {
        const HELIUS_CACHE_TTL = 2 * 60 * 1000;
        const TWO_YEARS_SEC = 2 * 365 * 24 * 60 * 60;
        const cutoffSec = Math.floor(Date.now() / 1000) - TWO_YEARS_SEC;
        let allSwaps: PortfolioTrade[] = [];

        for (const wallet of wallets) {
            const cacheKey = `helius-swaps-${cluster}-${wallet.address}`;

            // L1: Redis cache
            const cached = await this.cacheManager.get<PortfolioTrade[]>(cacheKey);
            if (cached && Array.isArray(cached)) {
                this.logger.log(`[fetchAllTrades] cache hit: ${wallet.address} (${cached.length} swaps)`);
                allSwaps = allSwaps.concat(cached);
                continue;
            }

            // L2: DB — get known signatures for this wallet (all types for dedup)
            const knownRows = await this.transactionRepository.find({
                where: { signerAddress: wallet.address, network: cluster },
                select: ["signature"]
            });
            const knownSigs = new Set(knownRows.map((r) => r.signature));

            // Paginate via fetchWalletActivities (DB save handled inside)
            const MAX_PAGES_PER_WALLET = 20; // max 2000 trades per wallet per sync
            let beforeSig: string | undefined = undefined;
            let done = false;
            let pages = 0;

            while (!done && pages < MAX_PAGES_PER_WALLET) {
                pages++;
                const page = await this.fetchWalletActivities(cluster, wallet.address, "all", 100, beforeSig);

                if (!page || page.length === 0) {
                    done = true;
                    break;
                }

                for (const tx of page) {
                    if (knownSigs.has(tx.signature)) {
                        done = true;
                        break;
                    }
                    if (tx.timestamp < cutoffSec) {
                        done = true;
                        break;
                    }
                }

                if (!done) {
                    beforeSig = page[page.length - 1].signature;
                }
            }

            // Load all trades from DB for this wallet within 2 years (SWAP only for PnL)
            const dbTrades = await this.transactionRepository
                .createQueryBuilder("t")
                .where("t.signerAddress = :addr", { addr: wallet.address })
                .andWhere("t.network = :network", { network: cluster })
                .andWhere("t.type = :type", { type: TransactionType.SWAP })
                .andWhere("t.blockTime >= :cutoff", { cutoff: new Date(cutoffSec * 1000) })
                .orderBy("t.blockTime", "DESC")
                .limit(5000)
                .getMany();

            const walletSwaps: PortfolioTrade[] = dbTrades.map((row) => ({
                signature: row.signature,
                timestamp: row.blockTime ? Math.floor(row.blockTime.getTime() / 1000) : 0,
                type: "SWAP",
                tokenTransfers: this.getStoredTokenTransfers(row.metadata),
                description: row.memo
            }));

            this.logger.log(`[fetchAllTrades] DB total: ${walletSwaps.length} swaps for ${wallet.address}`);
            await this.cacheManager.set(cacheKey, walletSwaps, HELIUS_CACHE_TTL);
            allSwaps = allSwaps.concat(walletSwaps);
        }

        return allSwaps;
    }

    private calculatePnl(trades: PortfolioTrade[]): Map<
        string,
        {
            token: string;
            symbol: string;
            pnl: number;
            investment: number;
            totalTokensBought: number;
            totalSolSpent: number;
        }
    > {
        const pnlMap = new Map<
            string,
            {
                token: string;
                symbol: string;
                pnl: number;
                investment: number;
                totalTokensBought: number;
                totalSolSpent: number;
            }
        >();

        // Sort trades by time to process them chronologically
        const sortedTrades = trades.sort((a, b) => a.timestamp - b.timestamp);

        for (const trade of sortedTrades) {
            if (trade.type !== "SWAP") continue;

            const tokenOut = trade.tokenTransfers.find((t) => t.fromUserAccount);
            const tokenIn = trade.tokenTransfers.find((t) => t.toUserAccount);
            const description = trade.description;

            if (!tokenOut || !tokenIn || !description) continue;

            // Extract symbol from description like "Swapped 2.02 SOL for 2,234.18 WIF"
            const symbolMatch = description.match(/for [\d,.]+ (\w+)/);
            const tradeSymbol = symbolMatch ? symbolMatch[1] : "?";

            const isBuy = tokenIn.mint !== COMMON_TOKEN_MINT.SOL;
            const tokenMint = isBuy ? tokenIn.mint : tokenOut.mint;
            const solAmount = isBuy ? tokenOut.tokenAmount : tokenIn.tokenAmount;
            const tokenAmount = isBuy ? tokenIn.tokenAmount : tokenOut.tokenAmount;

            if (!tokenMint || !solAmount || !tokenAmount) continue;

            let record = pnlMap.get(tokenMint);
            if (!record) {
                record = {
                    token: tokenMint,
                    symbol: tradeSymbol,
                    pnl: 0,
                    investment: 0,
                    totalTokensBought: 0,
                    totalSolSpent: 0
                };
            }
            // Always update symbol in case the first transaction was a sell
            if (record.symbol === "?") {
                record.symbol = tradeSymbol;
            }

            if (isBuy) {
                record.totalTokensBought += tokenAmount;
                record.totalSolSpent += solAmount;
                record.investment += solAmount; // Track total lifetime investment
            } else {
                // Sell
                if (record.totalTokensBought > 0) {
                    const avgCostPerToken = record.totalSolSpent / record.totalTokensBought;
                    const costOfGoodsSold = tokenAmount * avgCostPerToken;
                    const tradePnl = solAmount - costOfGoodsSold;
                    record.pnl += tradePnl;

                    // Adjust running totals
                    record.totalTokensBought -= tokenAmount;
                    record.totalSolSpent -= costOfGoodsSold;

                    // If we sold more than we had (due to data inconsistencies), clamp to zero
                    if (record.totalTokensBought < 0) record.totalTokensBought = 0;
                    if (record.totalSolSpent < 0) record.totalSolSpent = 0;
                }
            }
            pnlMap.set(tokenMint, record);
        }
        return pnlMap;
    }

    private async getTransactionStats(cluster: Cluster, wallets: Wallet[]) {
        const stats = {
            total: 0,
            buys: 0,
            sells: 0,
            transfers: 0,
            last_24h: 0
        };

        const HELIUS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
        const now = Math.floor(Date.now() / 1000);
        const twentyFourHoursAgo = now - 24 * 60 * 60;

        for (const wallet of wallets) {
            const cacheKey = `helius-tx-stats-${cluster}-${wallet.address}`;
            const cachedTxs = await this.cacheManager.get<EnhancedTransaction[]>(cacheKey);
            const transactions =
                cachedTxs && Array.isArray(cachedTxs)
                    ? cachedTxs
                    : await (async () => {
                          try {
                              const fetched = await this.rateLimitedHeliusCall(() =>
                                  this.heliusResolver.forCluster(cluster).getEnhancedTransactionsByAddress(wallet.address, { limit: 100 })
                              );
                              await this.cacheManager.set(cacheKey, fetched, HELIUS_CACHE_TTL);
                              return fetched;
                          } catch (error) {
                              if (axios.isAxiosError(error) && error.response?.status === 404) {
                                  console.log(`No transactions found for wallet ${wallet.address}.`);
                                  await this.cacheManager.set(cacheKey, [], HELIUS_CACHE_TTL);
                              } else {
                                  console.error(`Failed to fetch transaction stats for ${wallet.address}`);
                              }
                              return [];
                          }
                      })();

            // Save fetched transactions to DB (fire-and-forget)
            const toSave = transactions.filter((tx) => this.isSwap(tx, wallet.address));
            if (toSave.length > 0) {
                const entities: TransactionInsertRow[] = toSave.map((tx) => {
                    const allTransfers = [...(tx.tokenTransfers ?? []), ...(tx.nativeTransfers ?? []).map((nt) => this.nativeTransferToTokenTransfer(nt))];
                    const tokenOut = allTransfers.find((t) => t.fromUserAccount === wallet.address);
                    const tokenIn = allTransfers.find((t) => t.toUserAccount === wallet.address);
                    const metadata: Transaction["metadata"] = { tokenTransfers: allTransfers };
                    return {
                        signature: tx.signature,
                        network: cluster,
                        type: this.mapTxType(tx.type),
                        status: TransactionStatus.CONFIRMED,
                        amount: tokenOut?.tokenAmount ?? 0,
                        amountOut: tokenIn?.tokenAmount,
                        tokenMint: tokenOut?.mint,
                        tokenMintOut: tokenIn?.mint,
                        signerAddress: wallet.address,
                        blockTime: new Date(tx.timestamp * 1000),
                        memo: tx.description ?? null,
                        metadata
                    };
                });
                this.insertTransactionsIgnore(entities).catch((err) => this.logger.error("Failed to save stats transactions:", err));
            }

            for (const tx of transactions) {
                stats.total++;
                if (tx.timestamp > twentyFourHoursAgo) {
                    stats.last_24h++;
                }

                if (tx.type === "SWAP" || (tx.type === "UNKNOWN" && DEX_SOURCES.includes(tx.source))) {
                    const tokenOut = tx.tokenTransfers.find((t) => t.fromUserAccount === wallet.address);
                    if (tokenOut) {
                        stats.sells++;
                    } else {
                        stats.buys++;
                    }
                } else if (tx.type === "TRANSFER") {
                    stats.transfers++;
                }
            }
        }
        return stats;
    }

    private getTimeRange(timeFrame: string): { start: number; end: number } {
        const end = Date.now();
        let start: number;
        switch (timeFrame) {
            case "7d":
                start = end - 7 * 24 * 60 * 60 * 1000;
                break;
            case "30d":
                start = end - 30 * 24 * 60 * 60 * 1000;
                break;
            case "90d":
                start = end - 90 * 24 * 60 * 60 * 1000;
                break;
            case "1y":
                start = end - 365 * 24 * 60 * 60 * 1000;
                break;
            case "all":
            default:
                // For 'all', we might need to find the first transaction date.
                // For simplicity, let's default to 1 year.
                start = end - 365 * 24 * 60 * 60 * 1000;
                break;
        }
        return { start, end };
    }

    private getIntervalMillis(interval: string): number {
        switch (interval) {
            case "1h":
                return 60 * 60 * 1000;
            case "1d":
                return 24 * 60 * 60 * 1000;
            case "1w":
                return 7 * 24 * 60 * 60 * 1000;
            default:
                return 24 * 60 * 60 * 1000; // Default to 1 day
        }
    }

    // ── Watch endpoints: bypass ownership, use address directly ──────────────

    async getOverviewByAddress(cluster: Cluster, walletAddress: string, _timeFrame?: string) {
        const pubkey = new PublicKey(walletAddress);
        const tokenAccountsPromise: Promise<ParsedTokenAccount[]> = this.solanaService.getParsedTokenAccountsByOwner(cluster, pubkey);

        const [solPrice, total_balance_sol, tokenAccounts] = await Promise.all([
            this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL),
            this.solanaService.getBalance(cluster, pubkey),
            tokenAccountsPromise
        ]);
        let total_balance_usd = total_balance_sol * solPrice.priceUsd;

        const aggregatedTokens = new Map<string, AggregatedTokenHolding>();
        for (const acc of tokenAccounts) {
            const parsedInfo = acc.account.data.parsed.info;
            const mint = parsedInfo.mint;
            const tokenAmount = parsedInfo.tokenAmount;
            const amount = tokenAmount.uiAmount ?? 0;
            if (amount > 0) {
                const existing = aggregatedTokens.get(mint) || { amount: 0, decimals: tokenAmount.decimals };
                aggregatedTokens.set(mint, { amount: existing.amount + amount, decimals: existing.decimals });
            }
        }

        const mintAddresses = Array.from(aggregatedTokens.keys());
        const tokenMetaMap = await this.tokenService.findMany(cluster, mintAddresses);

        for (const [mint, data] of aggregatedTokens) {
            data.info = tokenMetaMap.get(mint);
        }

        const tokenPrices = await this.tokenPriceService.getPrices(cluster, mintAddresses);

        let tokenTotalUsd = 0;
        const top_tokens: OverviewToken[] = [];
        const allocation: AllocationItem[] = [{ symbol: "SOL", value_usd: total_balance_sol * solPrice.priceUsd, percentage: 0 }];

        for (const [mint, data] of aggregatedTokens) {
            const price = tokenPrices.get(mint)?.priceUsd || 0;
            const valueUsd = data.amount * price;
            tokenTotalUsd += valueUsd;
            top_tokens.push({
                address: mint,
                symbol: data.info?.symbol || "???",
                name: data.info?.name || "Unknown",
                logo_uri: data.info?.logoUri || "",
                decimals: data.decimals,
                balance: data.amount,
                value_usd: valueUsd,
                percent_of_portfolio: 0,
                pnl: 0,
                price_change_24h: 0
            });
            allocation.push({ symbol: data.info?.symbol || "???", value_usd: valueUsd, percentage: 0 });
        }

        total_balance_usd += tokenTotalUsd;

        // Calculate percentages
        if (total_balance_usd > 0) {
            allocation[0].percentage = (allocation[0].value_usd / total_balance_usd) * 100;
            for (let i = 1; i < allocation.length; i++) {
                allocation[i].percentage = (allocation[i].value_usd / total_balance_usd) * 100;
            }
            for (const t of top_tokens) {
                t.percent_of_portfolio = (t.value_usd / total_balance_usd) * 100;
            }
        }

        top_tokens.sort((a, b) => b.value_usd - a.value_usd);

        return {
            total_balance_usd,
            total_balance_sol,
            balance_change_24h: 0,
            pnl: { total: 0, realized: 0, unrealized: 0, change_24h: 0, roi_percent: 0 },
            transactions: { total: 0, buys: 0, sells: 0, transfers: 0, last_24h: 0 },
            top_tokens: top_tokens.slice(0, 10),
            allocation: allocation.filter((a) => a.value_usd > 0).sort((a, b) => b.value_usd - a.value_usd)
        };
    }

    async getPositionsByAddress(
        cluster: Cluster,
        walletAddress: string,
        _sortBy: string = "value_usd",
        showZeroBalance: boolean = false
    ): Promise<PortfolioPositionsResponseDto> {
        const pubkey = new PublicKey(walletAddress);
        const tokenAccountsPromise: Promise<ParsedTokenAccount[]> = this.solanaService.getParsedTokenAccountsByOwner(cluster, pubkey);

        const [solPrice, totalSolBalance, tokenAccounts] = await Promise.all([
            this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL),
            this.solanaService.getBalance(cluster, pubkey),
            tokenAccountsPromise
        ]);

        const aggregatedTokens = new Map<string, AggregatedTokenHolding>();
        for (const acc of tokenAccounts) {
            const parsedInfo = acc.account.data.parsed.info;
            const mint = parsedInfo.mint;
            const tokenAmount = parsedInfo.tokenAmount;
            const amount = tokenAmount.uiAmount ?? 0;
            if (amount > 0 || showZeroBalance) {
                const existing = aggregatedTokens.get(mint) || { amount: 0, decimals: tokenAmount.decimals };
                aggregatedTokens.set(mint, { amount: existing.amount + amount, decimals: existing.decimals });
            }
        }

        const mintAddresses = Array.from(aggregatedTokens.keys());
        const tokenMetaMap = await this.tokenService.findMany(cluster, mintAddresses);

        for (const [mint, data] of aggregatedTokens) {
            data.info = tokenMetaMap.get(mint);
        }

        const tokenPrices = await this.tokenPriceService.getPrices(cluster, mintAddresses);

        const positions: PortfolioPositionResponseDto[] = Array.from(aggregatedTokens.entries()).map(([mint, data]) => {
            const price = tokenPrices.get(mint)?.priceUsd || 0;
            return {
                mint,
                name: data.info?.name || "Unknown Token",
                symbol: data.info?.symbol || "???",
                logo: data.info?.logoUri || "",
                decimals: data.decimals,
                amount: data.amount,
                price,
                value_usd: data.amount * price,
                pnl: 0,
                pnl_percent: 0
            };
        });

        if (totalSolBalance > 0 || showZeroBalance) {
            positions.push({
                ...this.defaultSolMeta(),
                amount: totalSolBalance,
                price: solPrice.priceUsd,
                value_usd: totalSolBalance * solPrice.priceUsd,
                pnl: 0,
                pnl_percent: 0
            });
        }

        positions.sort((a, b) => b.value_usd - a.value_usd);

        const total_value_usd = positions.reduce((acc, p) => acc + p.value_usd, 0);
        return {
            positions,
            summary: { total_value_usd, total_tokens: positions.length, total_pnl: 0 }
        };
    }

    private defaultSolMeta() {
        return {
            name: "Solana",
            symbol: "SOL",
            mint: COMMON_TOKEN_MINT.SOL,
            logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
            decimals: 9
        };
    }

    /**
     * Option C enrichment: for TRANSFER_OUT SOL activities where the wallet sent SOL,
     * fetch the full Helius transaction details and check accountData.tokenBalanceChanges
     * to detect unclassified swaps (e.g. Jupiter multi-hop routes that split across txs).
     */
    private async enrichActivitiesWithSwapDetails(cluster: Cluster, activities: PortfolioActivity[], tokenMetaMap: Map<string, TokenMetadata>): Promise<void> {
        const getSymbol = (mint: string) => (mint === COMMON_TOKEN_MINT.SOL ? "SOL" : (tokenMetaMap.get(mint)?.symbol ?? mint.slice(0, 8)));
        const getLogo = (mint: string) =>
            mint === COMMON_TOKEN_MINT.SOL
                ? "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
                : (tokenMetaMap.get(mint)?.logoUri ?? "");

        const candidates = activities
            .map((a, i) => ({ a, i }))
            .filter(({ a }) => a.type === "TRANSFER_OUT" && a.token?.address === COMMON_TOKEN_MINT.SOL && !!a.from);

        if (!candidates.length) return;

        await Promise.all(
            candidates.map(async ({ a: activity, i: idx }) => {
                try {
                    const data = await this.rateLimitedHeliusCall(() => this.heliusResolver.forCluster(cluster).getEnhancedTransactions([activity.tx_hash]));
                    const txDetail = Array.isArray(data) ? data[0] : null;
                    if (!txDetail) return;

                    // Find this wallet's accountData to see token balance changes
                    const walletData = (txDetail.accountData ?? []).find((d) => d.account === activity.from);
                    if (!walletData) return;

                    // Any positive tokenBalanceChange means the wallet received a token in this tx
                    const received = (walletData.tokenBalanceChanges ?? []).find((c) => parseFloat(c.rawTokenAmount?.tokenAmount ?? "0") > 0);
                    if (!received) return;

                    const decimals: number = received.rawTokenAmount?.decimals ?? 0;
                    const amount = parseFloat(received.rawTokenAmount?.tokenAmount ?? "0") / Math.pow(10, decimals);
                    const mint: string = received.mint;

                    // Reclassify as SWAP
                    const updated: PortfolioActivity = {
                        ...activity,
                        type: "SWAP",
                        app: { name: "Jupiter", type: "DEX", icon: "" },
                        token_in: activity.token,
                        token_out: { address: mint, symbol: getSymbol(mint), logo_uri: getLogo(mint), amount, value_usd: 0 }
                    };
                    delete updated.token;
                    delete updated.from;
                    delete updated.to;
                    activities[idx] = updated;
                } catch {
                    // keep original activity if enrichment fails
                }
            })
        );
    }

    async getActivitiesByAddress(
        cluster: Cluster,
        walletAddress: string,
        type: string = "all",
        limit: number = 20,
        before?: string,
        from?: number,
        to?: number
    ) {
        const solPrice = await this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL);

        let txs = await this.fetchWalletActivities(cluster, walletAddress, type, limit, before);
        if (from) txs = txs.filter((tx) => (tx.timestamp ?? 0) >= Number(from));
        if (to) txs = txs.filter((tx) => (tx.timestamp ?? 0) <= Number(to));

        const sliced = txs.slice(0, limit);

        // Collect unique mints from transactions for metadata lookup
        const uniqueMints = new Set<string>();
        for (const tx of sliced) {
            for (const transfer of tx.tokenTransfers ?? []) {
                if (transfer.mint) uniqueMints.add(transfer.mint);
            }
        }
        const tokenMetaMap = await this.tokenService.findMany(cluster, Array.from(uniqueMints));

        const mappedActivities = await Promise.all(sliced.map((tx) => this.mapToActivity(cluster, tx, walletAddress, solPrice.priceUsd, tokenMetaMap)));
        const activities = mappedActivities.filter((a): a is NonNullable<typeof a> => a !== null);

        await this.enrichActivitiesWithSwapDetails(cluster, activities, tokenMetaMap);

        return {
            activities,
            total: activities.length,
            summary: {
                total_volume_usd: 0,
                total_fees_usd: activities.reduce((acc, a) => acc + a.fee_usd, 0)
            }
        };
    }

    async getPnlChartByAddress(cluster: Cluster, walletAddress: string, timeFrame: string = "7d", interval: string = "1d") {
        const now = Date.now();
        let startTime = now - 7 * 24 * 60 * 60 * 1000;
        let intervalMs = 24 * 60 * 60 * 1000;

        switch (timeFrame) {
            case "7d":
                startTime = now - 7 * 24 * 60 * 60 * 1000;
                break;
            case "30d":
                startTime = now - 30 * 24 * 60 * 60 * 1000;
                break;
            case "90d":
                startTime = now - 90 * 24 * 60 * 60 * 1000;
                break;
            case "1y":
                startTime = now - 365 * 24 * 60 * 60 * 1000;
                break;
            case "all":
                startTime = now - 2 * 365 * 24 * 60 * 60 * 1000;
                break;
        }
        switch (interval) {
            case "1h":
                intervalMs = 60 * 60 * 1000;
                break;
            case "1w":
                intervalMs = 7 * 24 * 60 * 60 * 1000;
                break;
        }

        const pnlAddrCacheKey = `pnl_chart_addr:${cluster}:${walletAddress}:${timeFrame}:${interval}`;
        const pnlAddrCached = await this.cacheManager.get<{ chart_data: { timestamp: number; pnl: number; balance_usd: number }[] }>(pnlAddrCacheKey);
        if (pnlAddrCached) return pnlAddrCached;

        const TWO_YEARS_SEC = 2 * 365 * 24 * 60 * 60;
        const cutoffSec = Math.floor(now / 1000) - TWO_YEARS_SEC;
        const startTimeSec = Math.floor(startTime / 1000);

        const count = await this.transactionRepository.count({
            where: { signerAddress: walletAddress, type: TransactionType.SWAP, network: cluster }
        });
        if (count === 0) {
            await this.fetchWalletActivities(cluster, walletAddress, "all", 100);
        }

        const dbTrades = await this.transactionRepository
            .createQueryBuilder("t")
            .where("t.signerAddress = :addr", { addr: walletAddress })
            .andWhere("t.network = :network", { network: cluster })
            .andWhere("t.type = :type", { type: TransactionType.SWAP })
            .andWhere("t.blockTime >= :start", { start: new Date(startTimeSec * 1000) })
            .andWhere("t.blockTime >= :cutoff", { cutoff: new Date(cutoffSec * 1000) })
            .orderBy("t.blockTime", "ASC")
            .getMany();

        const filteredTrades = dbTrades.map((row) => ({
            signature: row.signature,
            timestamp: row.blockTime ? Math.floor(row.blockTime.getTime() / 1000) : 0,
            type: "SWAP",
            tokenTransfers: this.getStoredTokenTransfers(row.metadata)
        }));

        const historyFrom = filteredTrades.length > 0 ? filteredTrades[0].timestamp : startTimeSec;
        const solPriceChart = await this.tokenPriceService.getPriceHistory(cluster, COMMON_TOKEN_MINT.SOL, historyFrom, Math.floor(now / 1000));

        const runningHoldings = new Map<string, { totalTokensBought: number; totalSolSpent: number }>();
        let cumulativePnlSol = 0;
        let tradeIndex = 0;
        const chartData: { timestamp: number; pnl: number; balance_usd: number }[] = [];

        for (let time = startTime; time <= now; time += intervalMs) {
            const timeSec = Math.floor(time / 1000);
            while (tradeIndex < filteredTrades.length && filteredTrades[tradeIndex].timestamp <= timeSec) {
                const trade = filteredTrades[tradeIndex++];
                if (trade.type !== "SWAP") continue;
                const tokenOut = trade.tokenTransfers.find((t) => t.fromUserAccount);
                const tokenIn = trade.tokenTransfers.find((t) => t.toUserAccount);
                if (!tokenOut || !tokenIn) continue;
                const isBuy = tokenIn.mint !== COMMON_TOKEN_MINT.SOL;
                const tokenMint = isBuy ? tokenIn.mint : tokenOut.mint;
                const solAmount = isBuy ? tokenOut.tokenAmount : tokenIn.tokenAmount;
                const tokenAmount = isBuy ? tokenIn.tokenAmount : tokenOut.tokenAmount;
                if (!tokenMint || !solAmount || !tokenAmount) continue;
                const holding = runningHoldings.get(tokenMint) ?? { totalTokensBought: 0, totalSolSpent: 0 };
                if (isBuy) {
                    holding.totalTokensBought += tokenAmount;
                    holding.totalSolSpent += solAmount;
                } else {
                    const avgCost = holding.totalTokensBought > 0 ? holding.totalSolSpent / holding.totalTokensBought : 0;
                    const cogs = tokenAmount * avgCost;
                    cumulativePnlSol += solAmount - cogs;
                    holding.totalTokensBought = Math.max(0, holding.totalTokensBought - tokenAmount);
                    holding.totalSolSpent = Math.max(0, holding.totalSolSpent - cogs);
                }
                runningHoldings.set(tokenMint, holding);
            }
            const solPriceAtTime = this.getSolPriceNear(timeSec, solPriceChart);
            const pnlUsd = cumulativePnlSol * solPriceAtTime;
            chartData.push({ timestamp: time, pnl: pnlUsd, balance_usd: pnlUsd });
        }

        const pnlAddrResult = { chart_data: chartData };
        await this.cacheManager.set(pnlAddrCacheKey, pnlAddrResult, 2 * 60 * 1000);
        return pnlAddrResult;
    }
}

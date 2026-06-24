import { Injectable } from "@nestjs/common";
import { AnalyticsRepository } from "../repositories/analytics.repository";
import type { AnalyticsQueryDto } from "../dtos/analytics-query.dto";
import type { NormalizedSwap } from "../types/admin.types";

function parseDateRange(dto: AnalyticsQueryDto): { startDate: Date; endDate: Date } {
    const endDate = dto.endDate ? new Date(dto.endDate) : new Date();
    endDate.setHours(23, 59, 59, 999);

    const startDate = dto.startDate ? new Date(dto.startDate) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    startDate.setHours(0, 0, 0, 0);

    return { startDate, endDate };
}

function toDateStr(d: Date): string {
    return d.toISOString().slice(0, 10);
}

@Injectable()
export class AdminAnalyticsService {
    constructor(private readonly analyticsRepo: AnalyticsRepository) {}

    // Merge two normalized arrays, dedup by signature (swap_executions wins — has volumeUsd)
    private mergeSwaps(fromSE: NormalizedSwap[], fromTx: NormalizedSwap[]): NormalizedSwap[] {
        const map = new Map<string, NormalizedSwap>();
        for (const tx of fromTx) map.set(tx.signature, tx);
        for (const se of fromSE) map.set(se.signature, se);
        return Array.from(map.values());
    }

    async getOverview(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);

        const [totalUsers, newUsersInRange, seSwaps, txSwaps] = await Promise.all([
            this.analyticsRepo.getTotalUsers(),
            this.analyticsRepo.getNewUsersCount(startDate, endDate),
            this.analyticsRepo.getSwapExecutionsNormalized(startDate, endDate),
            this.analyticsRepo.getTransactionsNormalized(startDate, endDate)
        ]);

        const merged = this.mergeSwaps(seSwaps, txSwaps);
        const totalSwaps = merged.length;
        const totalVolumeUsd = merged.reduce((sum, s) => sum + (s.volumeUsd ?? 0), 0);
        const activeWalletsInRange = new Set(merged.map((s) => s.walletAddress).filter(Boolean)).size;

        return { totalUsers, newUsersInRange, totalSwaps, totalVolumeUsd, activeWalletsInRange };
    }

    async getUsersOverTime(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        return this.analyticsRepo.getUsersOverTime(startDate, endDate);
    }

    async getSwapsOverTime(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);

        const [seSwaps, txSwaps] = await Promise.all([
            this.analyticsRepo.getSwapExecutionsNormalized(startDate, endDate),
            this.analyticsRepo.getTransactionsNormalized(startDate, endDate)
        ]);

        const merged = this.mergeSwaps(seSwaps, txSwaps);
        const byDate = new Map<string, { count: number; volumeUsd: number }>();

        for (const s of merged) {
            const d = toDateStr(s.createdAt);
            const existing = byDate.get(d) ?? { count: 0, volumeUsd: 0 };
            byDate.set(d, { count: existing.count + 1, volumeUsd: existing.volumeUsd + (s.volumeUsd ?? 0) });
        }

        return Array.from(byDate.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, { count, volumeUsd }]) => ({ date, count, volumeUsd }));
    }

    async getTopPairs(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        const limit = dto.limit ?? 10;

        const [seSwaps, txSwaps] = await Promise.all([
            this.analyticsRepo.getSwapExecutionsNormalized(startDate, endDate),
            this.analyticsRepo.getTransactionsNormalized(startDate, endDate)
        ]);

        const merged = this.mergeSwaps(seSwaps, txSwaps);
        const byPair = new Map<string, { inputMint: string; outputMint: string; swapCount: number; volumeUsd: number }>();

        for (const s of merged) {
            if (!s.outputMint) continue;
            const key = `${s.inputMint}:${s.outputMint}`;
            const existing = byPair.get(key) ?? { inputMint: s.inputMint, outputMint: s.outputMint, swapCount: 0, volumeUsd: 0 };
            byPair.set(key, { ...existing, swapCount: existing.swapCount + 1, volumeUsd: existing.volumeUsd + (s.volumeUsd ?? 0) });
        }

        const pairs = Array.from(byPair.values())
            .sort((a, b) => b.swapCount - a.swapCount)
            .slice(0, limit);

        // Enrich with token metadata
        const allMints = [...new Set(pairs.flatMap((p) => [p.inputMint, p.outputMint]))];
        const tokenMeta = await this.analyticsRepo.getTokenMetadata(allMints);

        return pairs.map((p) => ({
            inputMint: p.inputMint,
            inputSymbol: tokenMeta.get(p.inputMint)?.symbol ?? null,
            inputName: tokenMeta.get(p.inputMint)?.name ?? null,
            inputLogoUri: tokenMeta.get(p.inputMint)?.logoUri ?? null,
            outputMint: p.outputMint,
            outputSymbol: tokenMeta.get(p.outputMint)?.symbol ?? null,
            outputName: tokenMeta.get(p.outputMint)?.name ?? null,
            outputLogoUri: tokenMeta.get(p.outputMint)?.logoUri ?? null,
            swapCount: p.swapCount,
            volumeUsd: p.volumeUsd
        }));
    }

    async getTopTokens(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        const limit = dto.limit ?? 10;

        const [seSwaps, txSwaps] = await Promise.all([
            this.analyticsRepo.getSwapExecutionsNormalized(startDate, endDate),
            this.analyticsRepo.getTransactionsNormalized(startDate, endDate)
        ]);

        const merged = this.mergeSwaps(seSwaps, txSwaps);
        const byToken = new Map<string, { mint: string; swapCount: number; volumeUsd: number }>();

        for (const s of merged) {
            const existing = byToken.get(s.inputMint) ?? { mint: s.inputMint, swapCount: 0, volumeUsd: 0 };
            byToken.set(s.inputMint, { ...existing, swapCount: existing.swapCount + 1, volumeUsd: existing.volumeUsd + (s.volumeUsd ?? 0) });
        }

        return Array.from(byToken.values())
            .sort((a, b) => b.swapCount - a.swapCount)
            .slice(0, limit);
    }

    async getRecentSwaps(dto: AnalyticsQueryDto & { page?: number }) {
        const page = dto.page ?? 1;
        const limit = dto.limit ?? 20;
        const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
        const endDate = dto.endDate ? new Date(dto.endDate) : undefined;

        // Get all matching signatures from both tables (lightweight)
        const allSigs = await this.analyticsRepo.getSwapSigsPaged(startDate, endDate, dto.walletAddress, dto.userId, dto.tokenMint);

        // Deduplicate by signature (prefer swap_executions)
        const sigMap = new Map<string, { createdAt: Date; source: "swap_executions" | "transactions" }>();
        for (const row of allSigs) {
            const existing = sigMap.get(row.signature);
            if (!existing || row.source === "swap_executions") {
                sigMap.set(row.signature, { createdAt: row.createdAt, source: row.source });
            }
        }

        // Sort by createdAt DESC and paginate
        const sorted = Array.from(sigMap.entries()).sort(([, a], [, b]) => b.createdAt.getTime() - a.createdAt.getTime());
        const total = sorted.length;
        const pageSlice = sorted.slice((page - 1) * limit, page * limit);

        if (!pageSlice.length) return { swaps: [], total, page, limit };

        // Fetch full records for this page only
        const seSigs = pageSlice.filter(([, v]) => v.source === "swap_executions").map(([sig]) => sig);
        const txSigs = pageSlice.filter(([, v]) => v.source === "transactions").map(([sig]) => sig);

        const [seRecords, txRecords] = await Promise.all([
            this.analyticsRepo.getSwapExecutionsBySignatures(seSigs),
            this.analyticsRepo.getTransactionsBySignatures(txSigs)
        ]);

        // Normalize fetched records and re-sort to preserve createdAt DESC order
        const seNorm: NormalizedSwap[] = seRecords.map((r) => ({
            id: r.id,
            signature: r.signature,
            walletAddress: r.walletAddress,
            userId: r.userId,
            inputMint: r.inputMint,
            outputMint: r.outputMint,
            inAmount: r.inAmount,
            outAmount: r.outAmount,
            volumeUsd: r.volumeUsd != null ? parseFloat(String(r.volumeUsd)) : null,
            createdAt: r.createdAt,
            source: "swap_executions" as const
        }));
        const txNorm: NormalizedSwap[] = txRecords.map((r) => ({
            id: r.id,
            signature: r.signature,
            walletAddress: r.signerAddress ?? "",
            userId: null,
            inputMint: r.tokenMint ?? "",
            outputMint: r.tokenMintOut ?? "",
            inAmount: String(r.amount),
            outAmount: r.amountOut != null ? String(r.amountOut) : "0",
            volumeUsd: null,
            createdAt: r.createdAt,
            source: "transactions" as const
        }));

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const swaps = [...seNorm, ...txNorm].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map(({ source: _source, ...rest }) => rest);
        return { swaps, total, page, limit };
    }

    async getVolumeByPair(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        const limit = dto.limit ?? 10;

        const [seSwaps, txSwaps] = await Promise.all([
            this.analyticsRepo.getSwapExecutionsNormalized(startDate, endDate),
            this.analyticsRepo.getTransactionsNormalized(startDate, endDate)
        ]);

        const merged = this.mergeSwaps(seSwaps, txSwaps);
        const byPair = new Map<string, { inputMint: string; outputMint: string; swapCount: number; volumeUsd: number }>();

        for (const s of merged) {
            if (!s.outputMint) continue;
            const key = `${s.inputMint}:${s.outputMint}`;
            const existing = byPair.get(key) ?? { inputMint: s.inputMint, outputMint: s.outputMint, swapCount: 0, volumeUsd: 0 };
            byPair.set(key, { ...existing, swapCount: existing.swapCount + 1, volumeUsd: existing.volumeUsd + (s.volumeUsd ?? 0) });
        }

        return Array.from(byPair.values())
            .sort((a, b) => b.volumeUsd - a.volumeUsd)
            .slice(0, limit);
    }

    async getAllActiveUserIds(): Promise<string[]> {
        return this.analyticsRepo.getAllActiveUserIds();
    }
}

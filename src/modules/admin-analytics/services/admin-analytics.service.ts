import { Injectable } from "@nestjs/common";
import { AnalyticsRepository } from "../repositories/analytics.repository";
import type { AnalyticsQueryDto } from "../dtos/analytics-query.dto";

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

    async getOverview(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);

        const [totalUsers, newUsersInRange, swaps] = await Promise.all([
            this.analyticsRepo.getTotalUsers(),
            this.analyticsRepo.getNewUsersCount(startDate, endDate),
            this.analyticsRepo.getTransactionsNormalized(startDate, endDate)
        ]);

        const totalSwaps = swaps.length;
        const totalVolumeUsd = swaps.reduce((sum, s) => sum + (s.volumeUsd ?? 0), 0);
        const activeWalletsInRange = new Set(swaps.map((s) => s.walletAddress).filter(Boolean)).size;

        return { totalUsers, newUsersInRange, totalSwaps, totalVolumeUsd, activeWalletsInRange };
    }

    async getUsersOverTime(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        return this.analyticsRepo.getUsersOverTime(startDate, endDate);
    }

    async getSwapsOverTime(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);

        const swaps = await this.analyticsRepo.getTransactionsNormalized(startDate, endDate);
        const byDate = new Map<string, { count: number; volumeUsd: number }>();

        for (const s of swaps) {
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

        const swaps = await this.analyticsRepo.getTransactionsNormalized(startDate, endDate);
        const byPair = new Map<string, { inputMint: string; outputMint: string; swapCount: number; volumeUsd: number }>();

        for (const s of swaps) {
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

        const swaps = await this.analyticsRepo.getTransactionsNormalized(startDate, endDate);
        const byToken = new Map<string, { mint: string; swapCount: number; volumeUsd: number }>();

        for (const s of swaps) {
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

        const allSigs = await this.analyticsRepo.getSwapSigsPaged(startDate, endDate, dto.walletAddress, dto.tokenMint);

        const sorted = allSigs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        const total = sorted.length;
        const pageSlice = sorted.slice((page - 1) * limit, page * limit);

        if (!pageSlice.length) return { swaps: [], total, page, limit };

        const records = await this.analyticsRepo.getTransactionsBySignatures(pageSlice.map((r) => r.signature));

        const swaps = records
            .map((r) => ({
                id: r.id,
                signature: r.signature,
                walletAddress: r.signerAddress ?? "",
                userId: null,
                inputMint: r.tokenMint ?? "",
                outputMint: r.tokenMintOut ?? "",
                inAmount: String(r.amount),
                outAmount: r.amountOut != null ? String(r.amountOut) : "0",
                volumeUsd: null,
                createdAt: r.createdAt
            }))
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return { swaps, total, page, limit };
    }

    async getVolumeByPair(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        const limit = dto.limit ?? 10;

        const swaps = await this.analyticsRepo.getTransactionsNormalized(startDate, endDate);
        const byPair = new Map<string, { inputMint: string; outputMint: string; swapCount: number; volumeUsd: number }>();

        for (const s of swaps) {
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

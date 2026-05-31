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

@Injectable()
export class AdminAnalyticsService {
    constructor(private readonly analyticsRepo: AnalyticsRepository) {}

    async getOverview(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);

        const [totalUsers, newUsersInRange, totalSwaps, totalVolumeUsd, activeWalletsInRange] = await Promise.all([
            this.analyticsRepo.getTotalUsers(),
            this.analyticsRepo.getNewUsersCount(startDate, endDate),
            this.analyticsRepo.getTotalSwapExecutions(),
            this.analyticsRepo.getTotalVolumeUsd(),
            this.analyticsRepo.getActiveWalletsCount(startDate, endDate)
        ]);

        return {
            totalUsers,
            newUsersInRange,
            totalSwaps,
            totalVolumeUsd,
            activeWalletsInRange
        };
    }

    async getUsersOverTime(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        return this.analyticsRepo.getUsersOverTime(startDate, endDate);
    }

    async getSwapsOverTime(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        return this.analyticsRepo.getSwapsOverTime(startDate, endDate);
    }

    async getTopPairs(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        return this.analyticsRepo.getTopPairs(startDate, endDate, dto.limit ?? 10);
    }

    async getTopTokens(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        return this.analyticsRepo.getTopTokens(startDate, endDate, dto.limit ?? 10);
    }

    async getRecentSwaps(dto: AnalyticsQueryDto & { page?: number }) {
        const page = dto.page ?? 1;
        const limit = dto.limit ?? 20;
        const startDate = dto.startDate ? new Date(dto.startDate) : undefined;
        const endDate = dto.endDate ? new Date(dto.endDate) : undefined;
        const { swaps, total } = await this.analyticsRepo.getRecentSwaps(page, limit, startDate, endDate);
        return { swaps, total, page, limit };
    }

    async getVolumeByPair(dto: AnalyticsQueryDto) {
        const { startDate, endDate } = parseDateRange(dto);
        return this.analyticsRepo.getVolumeByPair(startDate, endDate, dto.limit ?? 10);
    }

    async getAllActiveUserIds(): Promise<string[]> {
        return this.analyticsRepo.getAllActiveUserIds();
    }
}

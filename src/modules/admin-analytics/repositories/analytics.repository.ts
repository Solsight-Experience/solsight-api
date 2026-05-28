import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { SwapTrade } from "../../portfolio/entities/swap-trade.entity";
import { SwapExecution } from "../entities/swap-execution.entity";

@Injectable()
export class AnalyticsRepository {
    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        @InjectRepository(SwapTrade) private readonly swapTradeRepo: Repository<SwapTrade>,
        @InjectRepository(SwapExecution) private readonly swapExecutionRepo: Repository<SwapExecution>
    ) {}

    async getTotalUsers(): Promise<number> {
        return this.userRepo.count();
    }

    async getNewUsersCount(startDate: Date, endDate: Date): Promise<number> {
        return this.userRepo.createQueryBuilder("u").where("u.createdAt >= :start AND u.createdAt <= :end", { start: startDate, end: endDate }).getCount();
    }

    async getTotalSwapTrades(): Promise<number> {
        return this.swapTradeRepo.count();
    }

    async getTotalSwapExecutions(): Promise<number> {
        return this.swapExecutionRepo.count();
    }

    async getTotalVolumeUsd(): Promise<number> {
        const result = await this.swapExecutionRepo.createQueryBuilder("se").select("SUM(se.volumeUsd)", "total").getRawOne<{ total: string | null }>();
        return parseFloat(result?.total ?? "0") || 0;
    }

    async getActiveWalletsCount(startDate: Date, endDate: Date): Promise<number> {
        const result = await this.swapExecutionRepo
            .createQueryBuilder("se")
            .select("COUNT(DISTINCT se.walletAddress)", "count")
            .where("se.createdAt >= :start AND se.createdAt <= :end", { start: startDate, end: endDate })
            .getRawOne<{ count: string }>();
        return parseInt(result?.count ?? "0", 10);
    }

    async getUsersOverTime(startDate: Date, endDate: Date): Promise<{ date: string; count: number }[]> {
        const rows = await this.userRepo
            .createQueryBuilder("u")
            .select("TO_CHAR(DATE(u.createdAt), 'YYYY-MM-DD')", "date")
            .addSelect("COUNT(*)", "count")
            .where("u.createdAt >= :start AND u.createdAt <= :end", { start: startDate, end: endDate })
            .groupBy("DATE(u.createdAt)")
            .orderBy("date", "ASC")
            .getRawMany<{ date: string; count: string }>();

        return rows.map((r) => ({ date: r.date, count: parseInt(r.count, 10) }));
    }

    async getSwapsOverTime(startDate: Date, endDate: Date): Promise<{ date: string; count: number; volumeUsd: number }[]> {
        const rows = await this.swapExecutionRepo
            .createQueryBuilder("se")
            .select("TO_CHAR(DATE(se.createdAt), 'YYYY-MM-DD')", "date")
            .addSelect("COUNT(*)", "count")
            .addSelect("SUM(se.volumeUsd)", "volumeUsd")
            .where("se.createdAt >= :start AND se.createdAt <= :end", { start: startDate, end: endDate })
            .groupBy("DATE(se.createdAt)")
            .orderBy("date", "ASC")
            .getRawMany<{ date: string; count: string; volumeUsd: string | null }>();

        return rows.map((r) => ({
            date: r.date,
            count: parseInt(r.count, 10),
            volumeUsd: parseFloat(r.volumeUsd ?? "0") || 0
        }));
    }

    async getTopTokens(startDate: Date, endDate: Date, limit: number): Promise<{ mint: string; swapCount: number; volumeUsd: number }[]> {
        const rows = await this.swapExecutionRepo
            .createQueryBuilder("se")
            .select("se.inputMint", "mint")
            .addSelect("COUNT(*)", "swapCount")
            .addSelect("SUM(se.volumeUsd)", "volumeUsd")
            .where("se.createdAt >= :start AND se.createdAt <= :end", { start: startDate, end: endDate })
            .groupBy("se.inputMint")
            .orderBy('"swapCount"', "DESC")
            .limit(limit)
            .getRawMany<{ mint: string; swapCount: string; volumeUsd: string | null }>();

        return rows.map((r) => ({
            mint: r.mint,
            swapCount: parseInt(r.swapCount, 10),
            volumeUsd: parseFloat(r.volumeUsd ?? "0") || 0
        }));
    }

    async getRecentSwaps(page: number, limit: number, startDate?: Date, endDate?: Date): Promise<{ swaps: SwapExecution[]; total: number }> {
        const qb = this.swapExecutionRepo
            .createQueryBuilder("se")
            .orderBy("se.createdAt", "DESC")
            .skip((page - 1) * limit)
            .take(limit);

        if (startDate) qb.andWhere("se.createdAt >= :start", { start: startDate });
        if (endDate) qb.andWhere("se.createdAt <= :end", { end: endDate });

        const [swaps, total] = await qb.getManyAndCount();
        return { swaps, total };
    }

    async getVolumeByPair(
        startDate: Date,
        endDate: Date,
        limit: number
    ): Promise<{ inputMint: string; outputMint: string; swapCount: number; volumeUsd: number }[]> {
        const rows = await this.swapExecutionRepo
            .createQueryBuilder("se")
            .select("se.inputMint", "inputMint")
            .addSelect("se.outputMint", "outputMint")
            .addSelect("COUNT(*)", "swapCount")
            .addSelect("SUM(se.volumeUsd)", "volumeUsd")
            .where("se.createdAt >= :start AND se.createdAt <= :end", { start: startDate, end: endDate })
            .groupBy("se.inputMint, se.outputMint")
            .orderBy('"volumeUsd"', "DESC")
            .limit(limit)
            .getRawMany<{ inputMint: string; outputMint: string; swapCount: string; volumeUsd: string | null }>();

        return rows.map((r) => ({
            inputMint: r.inputMint,
            outputMint: r.outputMint,
            swapCount: parseInt(r.swapCount, 10),
            volumeUsd: parseFloat(r.volumeUsd ?? "0") || 0
        }));
    }

    async getAllActiveUserIds(): Promise<string[]> {
        const rows = await this.userRepo.createQueryBuilder("u").select("u.id", "id").where("u.isActive = true").getRawMany<{ id: string }>();
        return rows.map((r) => r.id);
    }
}

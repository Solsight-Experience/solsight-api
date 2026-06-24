import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { SwapExecution } from "../entities/swap-execution.entity";
import { Token } from "../../tokens/entities/token.entity";
import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import { NormalizedSwap } from "../types/admin.types";

@Injectable()
export class AnalyticsRepository {
    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        @InjectRepository(SwapExecution) private readonly swapExecutionRepo: Repository<SwapExecution>,
        @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>
    ) {}

    // ---------------------------------------------------------------------------
    // Normalized dual-source fetchers
    // ---------------------------------------------------------------------------

    async getSwapExecutionsNormalized(start: Date, end: Date): Promise<NormalizedSwap[]> {
        const rows = await this.swapExecutionRepo.createQueryBuilder("se").where("se.createdAt >= :start AND se.createdAt <= :end", { start, end }).getMany();

        return rows.map((r) => ({
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
    }

    async getTransactionsNormalized(start: Date, end: Date): Promise<NormalizedSwap[]> {
        const rows = await this.txRepo
            .createQueryBuilder("t")
            .where("t.type = :type AND t.status = :status", {
                type: TransactionType.SWAP,
                status: TransactionStatus.CONFIRMED
            })
            .andWhere("t.createdAt >= :start AND t.createdAt <= :end", { start, end })
            .getMany();

        return rows.map((r) => ({
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
    }

    // Lightweight fetch for pagination: only signature + createdAt from both tables
    async getSwapSigsPaged(
        start?: Date,
        end?: Date,
        walletAddress?: string,
        userId?: string,
        tokenMint?: string
    ): Promise<{ signature: string; createdAt: Date; source: "swap_executions" | "transactions" }[]> {
        const seQb = this.swapExecutionRepo.createQueryBuilder("se").select(["se.signature", "se.createdAt"]);
        if (start) seQb.andWhere("se.createdAt >= :start", { start });
        if (end) seQb.andWhere("se.createdAt <= :end", { end });
        if (walletAddress) seQb.andWhere("se.walletAddress ILIKE :wa", { wa: `%${walletAddress}%` });
        if (userId) seQb.andWhere("se.userId ILIKE :uid", { uid: `%${userId}%` });
        if (tokenMint) seQb.andWhere("(se.inputMint ILIKE :tm OR se.outputMint ILIKE :tm)", { tm: `%${tokenMint}%` });
        const seRows = await seQb.getMany();

        const txQb = this.txRepo.createQueryBuilder("t").select(["t.signature", "t.createdAt"]).where("t.type = :type AND t.status = :status", {
            type: TransactionType.SWAP,
            status: TransactionStatus.CONFIRMED
        });
        if (start) txQb.andWhere("t.createdAt >= :start", { start });
        if (end) txQb.andWhere("t.createdAt <= :end", { end });
        if (walletAddress) txQb.andWhere("t.signerAddress ILIKE :wa", { wa: `%${walletAddress}%` });
        if (tokenMint) txQb.andWhere("(t.tokenMint ILIKE :tm OR t.tokenMintOut ILIKE :tm)", { tm: `%${tokenMint}%` });
        const txRows = await txQb.getMany();

        return [
            ...seRows.map((r) => ({ signature: r.signature, createdAt: r.createdAt, source: "swap_executions" as const })),
            ...txRows.map((r) => ({ signature: r.signature, createdAt: r.createdAt, source: "transactions" as const }))
        ];
    }

    async getSwapExecutionsBySignatures(signatures: string[]): Promise<SwapExecution[]> {
        if (!signatures.length) return [];
        return this.swapExecutionRepo.createQueryBuilder("se").where("se.signature IN (:...sigs)", { sigs: signatures }).getMany();
    }

    async getTransactionsBySignatures(signatures: string[]): Promise<Transaction[]> {
        if (!signatures.length) return [];
        return this.txRepo.createQueryBuilder("t").where("t.signature IN (:...sigs)", { sigs: signatures }).getMany();
    }

    // ---------------------------------------------------------------------------
    // User queries
    // ---------------------------------------------------------------------------

    async getTotalUsers(): Promise<number> {
        return this.userRepo.count();
    }

    async getNewUsersCount(startDate: Date, endDate: Date): Promise<number> {
        return this.userRepo.createQueryBuilder("u").where("u.createdAt >= :start AND u.createdAt <= :end", { start: startDate, end: endDate }).getCount();
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

    async getAllActiveUserIds(): Promise<string[]> {
        const rows = await this.userRepo.createQueryBuilder("u").select("u.id", "id").where("u.isActive = true").getRawMany<{ id: string }>();
        return rows.map((r) => r.id);
    }

    // ---------------------------------------------------------------------------
    // Token metadata lookup for top-pairs/top-tokens enrichment
    // ---------------------------------------------------------------------------

    async getTokenMetadata(mints: string[]): Promise<Map<string, { symbol: string | null; name: string | null; logoUri: string | null }>> {
        if (!mints.length) return new Map();
        const rows = await this.swapExecutionRepo.manager
            .getRepository(Token)
            .createQueryBuilder("t")
            .select(["t.address", "t.symbol", "t.name", "t.logoUri"])
            .where("t.address IN (:...mints)", { mints })
            .getMany();

        return new Map(rows.map((t) => [t.address, { symbol: t.symbol ?? null, name: t.name ?? null, logoUri: t.logoUri ?? null }]));
    }
}

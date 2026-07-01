import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { Token } from "../../tokens/entities/token.entity";
import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import { OhlcCandle } from "../../tokens/entities/ohlc-candle.entity";
import { NormalizedSwap } from "../types/admin.types";

@Injectable()
export class AnalyticsRepository {
    constructor(
        @InjectRepository(User) private readonly userRepo: Repository<User>,
        @InjectRepository(Transaction) private readonly txRepo: Repository<Transaction>,
        @InjectRepository(OhlcCandle) private readonly ohlcRepo: Repository<OhlcCandle>
    ) {}

    private async buildPriceMap(mints: string[], start: Date, end: Date): Promise<Map<string, { timestamp: number; close: number }[]>> {
        if (!mints.length) return new Map();
        const candles = await this.ohlcRepo
            .createQueryBuilder("c")
            .select(["c.tokenMint", "c.timestamp", "c.close"])
            .where("c.tokenMint IN (:...mints)", { mints })
            .andWhere("c.interval = :interval", { interval: "5m" })
            .andWhere("c.timestamp >= :start AND c.timestamp <= :end", { start: start.getTime(), end: end.getTime() })
            .orderBy("c.timestamp", "ASC")
            .getMany();

        const map = new Map<string, { timestamp: number; close: number }[]>();
        for (const c of candles) {
            const arr = map.get(c.tokenMint) ?? [];
            arr.push({ timestamp: Number(c.timestamp), close: Number(c.close) });
            map.set(c.tokenMint, arr);
        }
        return map;
    }

    private findClosestPrice(candles: { timestamp: number; close: number }[] | undefined, txTimeMs: number): number | null {
        if (!candles?.length) return null;
        let price: number | null = null;
        for (const c of candles) {
            if (c.timestamp <= txTimeMs) price = c.close;
            else break;
        }
        return price;
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

        const uniqueMints = [...new Set(rows.map((r) => r.tokenMint).filter(Boolean) as string[])];
        const priceMap = await this.buildPriceMap(uniqueMints, start, end);

        return rows.map((r) => {
            const txTimeMs = (r.blockTime ?? r.createdAt).getTime();
            const price = this.findClosestPrice(priceMap.get(r.tokenMint ?? ""), txTimeMs);
            const volumeUsd = price != null ? Number(r.amount) * price : null;

            return {
                id: r.id,
                signature: r.signature,
                walletAddress: r.signerAddress ?? "",
                userId: null,
                inputMint: r.tokenMint ?? "",
                outputMint: r.tokenMintOut ?? "",
                inAmount: String(r.amount),
                outAmount: r.amountOut != null ? String(r.amountOut) : "0",
                volumeUsd,
                createdAt: r.createdAt,
                source: "transactions" as const
            };
        });
    }

    async getSwapSigsPaged(start?: Date, end?: Date, walletAddress?: string, tokenMint?: string): Promise<{ signature: string; createdAt: Date }[]> {
        const qb = this.txRepo.createQueryBuilder("t").select(["t.signature", "t.createdAt"]).where("t.type = :type AND t.status = :status", {
            type: TransactionType.SWAP,
            status: TransactionStatus.CONFIRMED
        });
        if (start) qb.andWhere("t.createdAt >= :start", { start });
        if (end) qb.andWhere("t.createdAt <= :end", { end });
        if (walletAddress) qb.andWhere("t.signerAddress ILIKE :wa", { wa: `%${walletAddress}%` });
        if (tokenMint) qb.andWhere("(t.tokenMint ILIKE :tm OR t.tokenMintOut ILIKE :tm)", { tm: `%${tokenMint}%` });
        const rows = await qb.getMany();
        return rows.map((r) => ({ signature: r.signature, createdAt: r.createdAt }));
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
        const rows = await this.txRepo.manager
            .getRepository(Token)
            .createQueryBuilder("t")
            .select(["t.address", "t.symbol", "t.name", "t.logoUri"])
            .where("t.address IN (:...mints)", { mints })
            .getMany();

        return new Map(rows.map((t) => [t.address, { symbol: t.symbol ?? null, name: t.name ?? null, logoUri: t.logoUri ?? null }]));
    }
}

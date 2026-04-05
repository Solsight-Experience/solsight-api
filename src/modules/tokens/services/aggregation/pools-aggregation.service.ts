import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { RedisService } from "../../../../redis/services/redis.service";
import { StatsAggregationService } from "./stats-aggregation.service";
import { PortfolioService } from "src/modules/portfolio/services/portfolio.service";
import { Token } from "../../entities/token.entity";

const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT_MINT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";
const WSOL_MINT = "So11111111111111111111111111111111111111112";
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

const DEX_DISPLAY_NAMES: Record<string, string> = {
    raydium_clmm: "Raydium CLMM",
    raydium_cpmm: "Raydium CPMM",
    raydium_amm: "Raydium AMM V4",
    orca_whirlpool: "Orca Whirlpool"
};

interface RedisPoolSnapshot {
    pool_address: string;
    dex: string;
    token_a_mint: string;
    token_b_mint: string;
    token_a_symbol: string;
    token_b_symbol: string;
    reserve_a: number;
    reserve_b: number;
    fee_percent: number;
    last_updated: number;
}

interface RedisPoolSnapshotEntry {
    snapshot: RedisPoolSnapshot;
    rawValue: string;
    listIndex?: number;
    zsetScore?: number;
    hashField?: string;
}

type RedisPoolStorageType = "none" | "list" | "zset" | "hash" | "unknown";

export interface TokenPoolDto {
    pool_address: string;
    dex: string;
    pair_name: string;
    quote_symbol: string;
    liquidity_usd: number;
    volume_24h_usd: number;
    fee_percent: number;
    reserve_base: number;
    reserve_quote: number;
}

export interface TokenPoolsSummaryDto {
    total_liquidity_usd: number;
    total_volume_24h_usd: number;
    unique_dex_count: number;
    unique_pool_count: number;
}

export interface TokenPoolsResponseDto {
    pools: TokenPoolDto[];
    summary: TokenPoolsSummaryDto;
}

interface RedisPaginationResult {
    entries: RedisPoolSnapshotEntry[];
    usedRedisPagination: boolean;
    totalCount: number;
    storageType: RedisPoolStorageType;
}

@Injectable()
export class PoolsAggregationService {
    private readonly logger = new Logger(PoolsAggregationService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly redisService: RedisService,
        private readonly statsAggregationService: StatsAggregationService,
        private readonly portfolioService: PortfolioService
    ) {}

    async getPoolsForToken(tokenAddress: string, limit: number = DEFAULT_PAGE_LIMIT, offset: number = 0): Promise<TokenPoolsResponseDto> {
        const redis = this.redisService.getClient();
        if (!redis) {
            this.logger.warn("Redis unavailable, returning empty pools");
            return this.emptyResponse();
        }

        try {
            const normalizedLimit = this.normalizeLimit(limit);
            const normalizedOffset = this.normalizeOffset(offset);
            if (normalizedLimit === 0) {
                return this.emptyResponse();
            }

            const redisKey = `solsight:pools:${tokenAddress}`;

            const { entries, usedRedisPagination, totalCount, storageType } = await this.getPagedPoolSnapshots(redisKey, normalizedLimit, normalizedOffset);
            const snapshots = entries.map((entry) => entry.snapshot);

            if (snapshots.length === 0) {
                return this.emptyResponse(totalCount);
            }

            const symbolByMint = await this.resolveUnknownSymbolsFromDb(snapshots);
            const solPrice = await this.getSolPriceUsd();
            const poolVolumes = await this.getPoolVolumes(snapshots.map((s) => s.pool_address));

            const pools: TokenPoolDto[] = [];
            const snapshotsToBackfill: RedisPoolSnapshotEntry[] = [];

            for (const entry of entries) {
                const snapshot = entry.snapshot;
                const resolvedTokenASymbol = this.resolveSnapshotSymbol(snapshot.token_a_symbol, snapshot.token_a_mint, symbolByMint);
                const resolvedTokenBSymbol = this.resolveSnapshotSymbol(snapshot.token_b_symbol, snapshot.token_b_mint, symbolByMint);

                if (
                    this.shouldBackfillSymbol(snapshot.token_a_symbol, resolvedTokenASymbol) ||
                    this.shouldBackfillSymbol(snapshot.token_b_symbol, resolvedTokenBSymbol)
                ) {
                    snapshotsToBackfill.push({
                        ...entry,
                        snapshot: {
                            ...snapshot,
                            token_a_symbol: resolvedTokenASymbol,
                            token_b_symbol: resolvedTokenBSymbol
                        }
                    });
                }

                const isBaseTokenA = [WSOL_MINT, USDC_MINT, USDT_MINT].includes(snapshot.token_b_mint);
                const quoteMint = isBaseTokenA ? snapshot.token_b_mint : snapshot.token_a_mint;
                const baseSymbol = isBaseTokenA ? resolvedTokenASymbol : resolvedTokenBSymbol;
                const quoteSymbol = isBaseTokenA ? resolvedTokenBSymbol : resolvedTokenASymbol;
                const reserveBase = isBaseTokenA ? snapshot.reserve_a : snapshot.reserve_b;
                const reserveQuote = isBaseTokenA ? snapshot.reserve_b : snapshot.reserve_a;

                const quoteValueUsd = await this.getReserveValueUsd(quoteMint, reserveQuote, solPrice);
                const liquidityUsd = quoteValueUsd * 2;
                const volume24h = poolVolumes.get(snapshot.pool_address) ?? 0;
                const dexDisplay = DEX_DISPLAY_NAMES[snapshot.dex] ?? snapshot.dex;

                pools.push({
                    pool_address: snapshot.pool_address,
                    dex: dexDisplay,
                    pair_name: `${baseSymbol}/${quoteSymbol}`,
                    quote_symbol: quoteSymbol,
                    liquidity_usd: liquidityUsd,
                    volume_24h_usd: volume24h,
                    fee_percent: snapshot.fee_percent,
                    reserve_base: reserveBase,
                    reserve_quote: reserveQuote
                });
            }

            if (snapshotsToBackfill.length > 0) {
                await this.backfillResolvedSymbols(redisKey, storageType, snapshotsToBackfill);
            }

            pools.sort((a, b) => b.liquidity_usd - a.liquidity_usd);

            const summary: TokenPoolsSummaryDto = {
                total_liquidity_usd: pools.reduce((sum, p) => sum + p.liquidity_usd, 0),
                total_volume_24h_usd: pools.reduce((sum, p) => sum + p.volume_24h_usd, 0),
                unique_dex_count: new Set(pools.map((p) => p.dex)).size,
                unique_pool_count: totalCount || pools.length
            };

            const pagedPools = usedRedisPagination ? pools : pools.slice(normalizedOffset, normalizedOffset + normalizedLimit);

            return { pools: pagedPools, summary };
        } catch (error) {
            this.logger.error(`Error fetching pools for ${tokenAddress}:`, error);
            return this.emptyResponse();
        }
    }

    private normalizeLimit(limit?: number): number {
        const numericLimit = Number(limit);
        if (!Number.isFinite(numericLimit) || Number.isNaN(numericLimit)) {
            return DEFAULT_PAGE_LIMIT;
        }
        return Math.max(0, Math.min(MAX_PAGE_LIMIT, Math.trunc(numericLimit)));
    }

    private normalizeOffset(offset?: number): number {
        const numericOffset = Number(offset);
        if (!Number.isFinite(numericOffset) || Number.isNaN(numericOffset) || numericOffset < 0) {
            return 0;
        }
        return Math.trunc(numericOffset);
    }

    private async getPagedPoolSnapshots(redisKey: string, limit: number, offset: number): Promise<RedisPaginationResult> {
        const redis = this.redisService.getClient();
        if (!redis) {
            return { entries: [], usedRedisPagination: false, totalCount: 0, storageType: "none" };
        }

        const type = (await redis.type(redisKey)) as RedisPoolStorageType;

        if (type === "none") {
            return { entries: [], usedRedisPagination: false, totalCount: 0, storageType: "none" };
        }

        if (type === "list") {
            const totalCount = await redis.llen(redisKey);
            const values = await redis.lrange(redisKey, offset, offset + limit - 1);
            const entries = values
                .map((value, index) => ({ value, listIndex: offset + index }))
                .map(({ value, listIndex }) => {
                    const snapshot = this.parsePoolSnapshot(value);
                    if (!snapshot) {
                        return null;
                    }
                    return {
                        snapshot,
                        rawValue: value,
                        listIndex
                    } as RedisPoolSnapshotEntry;
                })
                .filter((entry): entry is RedisPoolSnapshotEntry => entry !== null);
            return {
                entries,
                usedRedisPagination: true,
                totalCount,
                storageType: "list"
            };
        }

        if (type === "zset") {
            const totalCount = await redis.zcard(redisKey);
            const values = await redis.zrevrange(redisKey, offset, offset + limit - 1, "WITHSCORES");
            const entries: RedisPoolSnapshotEntry[] = [];

            for (let i = 0; i < values.length; i += 2) {
                const rawValue = values[i];
                const score = Number(values[i + 1]);
                const snapshot = this.parsePoolSnapshot(rawValue);
                if (!snapshot) {
                    continue;
                }
                entries.push({
                    snapshot,
                    rawValue,
                    zsetScore: Number.isFinite(score) ? score : snapshot.last_updated
                });
            }

            return {
                entries,
                usedRedisPagination: true,
                totalCount,
                storageType: "zset"
            };
        }

        if (type !== "hash") {
            return { entries: [], usedRedisPagination: false, totalCount: 0, storageType: "unknown" };
        }

        const rawPools = await redis.hgetall(redisKey);
        const totalCount = await redis.hlen(redisKey);
        if (!rawPools || Object.keys(rawPools).length === 0) {
            return { entries: [], usedRedisPagination: false, totalCount, storageType: "hash" };
        }

        const entries = Object.entries(rawPools)
            .map(([hashField, rawValue]) => {
                const snapshot = this.parsePoolSnapshot(rawValue);
                if (!snapshot) {
                    return null;
                }
                return {
                    snapshot,
                    rawValue,
                    hashField
                } as RedisPoolSnapshotEntry;
            })
            .filter((entry): entry is RedisPoolSnapshotEntry => entry !== null);

        return {
            entries,
            usedRedisPagination: false,
            totalCount,
            storageType: "hash"
        };
    }

    private parsePoolSnapshot(value: string): RedisPoolSnapshot | null {
        try {
            return JSON.parse(value) as RedisPoolSnapshot;
        } catch (e) {
            this.logger.warn(`Failed to parse pool snapshot: ${String(e)}`);
            return null;
        }
    }

    private isUnknownSymbol(symbol?: string): boolean {
        return !symbol || symbol.trim().length === 0 || symbol.toUpperCase() === "UNKNOWN";
    }

    private resolveSnapshotSymbol(snapshotSymbol: string | undefined, mint: string, symbolByMint: Map<string, string>): string {
        if (typeof snapshotSymbol === "string" && !this.isUnknownSymbol(snapshotSymbol)) {
            return snapshotSymbol.trim();
        }
        const dbSymbol = symbolByMint.get(mint);
        if (dbSymbol && !this.isUnknownSymbol(dbSymbol)) {
            return dbSymbol;
        }
        return "UNKNOWN";
    }

    private shouldBackfillSymbol(previousSymbol: string | undefined, resolvedSymbol: string): boolean {
        return this.isUnknownSymbol(previousSymbol) && !this.isUnknownSymbol(resolvedSymbol);
    }

    private async resolveUnknownSymbolsFromDb(snapshots: RedisPoolSnapshot[]): Promise<Map<string, string>> {
        const unknownMints = new Set<string>();

        for (const snapshot of snapshots) {
            if (this.isUnknownSymbol(snapshot.token_a_symbol)) {
                unknownMints.add(snapshot.token_a_mint);
            }
            if (this.isUnknownSymbol(snapshot.token_b_symbol)) {
                unknownMints.add(snapshot.token_b_mint);
            }
        }

        if (unknownMints.size === 0) {
            return new Map();
        }

        const tokens = await this.tokenRepository.find({
            where: { address: In([...unknownMints]) },
            select: ["address", "symbol"]
        });

        return new Map(tokens.filter((token) => !this.isUnknownSymbol(token.symbol)).map((token) => [token.address, token.symbol.trim()]));
    }

    private async backfillResolvedSymbols(redisKey: string, storageType: RedisPoolStorageType, updatedEntries: RedisPoolSnapshotEntry[]): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis || updatedEntries.length === 0) {
            return;
        }

        const pipeline = redis.pipeline();
        let updates = 0;

        for (const entry of updatedEntries) {
            const serializedSnapshot = JSON.stringify(entry.snapshot);

            if (storageType === "list" && typeof entry.listIndex === "number") {
                pipeline.lset(redisKey, entry.listIndex, serializedSnapshot);
                updates += 1;
                continue;
            }

            if (storageType === "hash" && entry.hashField) {
                pipeline.hset(redisKey, entry.hashField, serializedSnapshot);
                updates += 1;
                continue;
            }

            if (storageType === "zset" && typeof entry.zsetScore === "number") {
                pipeline.zrem(redisKey, entry.rawValue);
                pipeline.zadd(redisKey, entry.zsetScore, serializedSnapshot);
                updates += 1;
            }
        }

        if (updates === 0) {
            return;
        }

        try {
            await pipeline.exec();
        } catch (e) {
            this.logger.warn(`Failed to backfill pool symbols in redis key ${redisKey}: ${String(e)}`);
        }
    }

    private async getReserveValueUsd(mint: string, reserve: number, solPriceUsd: number): Promise<number> {
        if (mint === USDC_MINT || mint === USDT_MINT) {
            return reserve;
        }
        if (mint === WSOL_MINT) {
            return reserve * solPriceUsd;
        }
        const priceUsd = await this.statsAggregationService.getLatestPrice(mint);
        if (priceUsd && priceUsd > 0) {
            return reserve * priceUsd;
        }
        return 0;
    }

    private async getSolPriceUsd(): Promise<number> {
        const cache = (await this.statsAggregationService.getLatestPrice(WSOL_MINT)) ?? 0;
        if (cache > 0) {
            return cache;
        }
        return this.portfolioService.getSolPriceUsd() ?? 0;
    }

    private async getPoolVolumes(poolAddresses: string[]): Promise<Map<string, number>> {
        const redis = this.redisService.getClient();
        const result = new Map<string, number>();
        if (!redis || poolAddresses.length === 0) return result;

        const since = Date.now() - 24 * 60 * 60 * 1000;

        const pipeline = redis.pipeline();
        for (const addr of poolAddresses) {
            pipeline.zrangebyscore(`solsight:pool_volume:${addr}`, since, "+inf");
        }

        try {
            const responses = await pipeline.exec();
            if (!responses) return result;

            for (let i = 0; i < poolAddresses.length; i++) {
                const [err, entries] = responses[i] ?? [null, []];
                if (err || !Array.isArray(entries)) continue;

                let total = 0;
                for (const entry of entries as string[]) {
                    const colonIdx = entry.indexOf(":");
                    if (colonIdx > 0) {
                        total += parseFloat(entry.substring(0, colonIdx)) || 0;
                    }
                }
                if (total > 0) {
                    result.set(poolAddresses[i], total);
                }
            }
        } catch (e) {
            this.logger.error("Failed to fetch pool volumes:", e);
        }

        return result;
    }

    private emptyResponse(uniquePoolCount: number = 0): TokenPoolsResponseDto {
        return {
            pools: [],
            summary: {
                total_liquidity_usd: 0,
                total_volume_24h_usd: 0,
                unique_dex_count: 0,
                unique_pool_count: uniquePoolCount
            }
        };
    }
}

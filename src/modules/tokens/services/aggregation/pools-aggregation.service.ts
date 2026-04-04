import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../../../redis/services/redis.service";
import { StatsAggregationService } from "./stats-aggregation.service";

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
    snapshots: RedisPoolSnapshot[];
    usedRedisPagination: boolean;
}

@Injectable()
export class PoolsAggregationService {
    private readonly logger = new Logger(PoolsAggregationService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly statsAggregationService: StatsAggregationService
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

            const { snapshots, usedRedisPagination } = await this.getPagedPoolSnapshots(redisKey, normalizedLimit, normalizedOffset);

            if (snapshots.length === 0) {
                return this.emptyResponse();
            }

            const solPrice = await this.getSolPriceUsd();
            const poolVolumes = await this.getPoolVolumes(snapshots.map((s) => s.pool_address));

            const pools: TokenPoolDto[] = [];

            for (const snapshot of snapshots) {
                const isBaseTokenA = snapshot.token_a_mint === tokenAddress;
                const quoteMint = isBaseTokenA ? snapshot.token_b_mint : snapshot.token_a_mint;
                const baseSymbol = isBaseTokenA ? snapshot.token_a_symbol : snapshot.token_b_symbol;
                const quoteSymbol = isBaseTokenA ? snapshot.token_b_symbol : snapshot.token_a_symbol;
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

            pools.sort((a, b) => b.liquidity_usd - a.liquidity_usd);

            const summary: TokenPoolsSummaryDto = {
                total_liquidity_usd: pools.reduce((sum, p) => sum + p.liquidity_usd, 0),
                total_volume_24h_usd: pools.reduce((sum, p) => sum + p.volume_24h_usd, 0),
                unique_dex_count: new Set(pools.map((p) => p.dex)).size,
                unique_pool_count: pools.length
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
            return { snapshots: [], usedRedisPagination: false };
        }

        const type = await redis.type(redisKey);

        if (type === "none") {
            return { snapshots: [], usedRedisPagination: false };
        }

        if (type === "list") {
            const values = await redis.lrange(redisKey, offset, offset + limit - 1);
            return {
                snapshots: this.parsePoolSnapshots(values),
                usedRedisPagination: true
            };
        }

        if (type === "zset") {
            const values = await redis.zrevrange(redisKey, offset, offset + limit - 1);
            return {
                snapshots: this.parsePoolSnapshots(values),
                usedRedisPagination: true
            };
        }

        const rawPools = await redis.hgetall(redisKey);
        if (!rawPools || Object.keys(rawPools).length === 0) {
            return { snapshots: [], usedRedisPagination: false };
        }

        const values = Object.values(rawPools);
        return {
            snapshots: this.parsePoolSnapshots(values),
            usedRedisPagination: false
        };
    }

    private parsePoolSnapshots(values: string[]): RedisPoolSnapshot[] {
        const snapshots: RedisPoolSnapshot[] = [];

        for (const value of values) {
            try {
                snapshots.push(JSON.parse(value) as RedisPoolSnapshot);
            } catch (e) {
                this.logger.warn(`Failed to parse pool snapshot: ${String(e)}`);
            }
        }

        return snapshots;
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
        return (await this.statsAggregationService.getLatestPrice(WSOL_MINT)) ?? 0;
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

    private emptyResponse(): TokenPoolsResponseDto {
        return {
            pools: [],
            summary: {
                total_liquidity_usd: 0,
                total_volume_24h_usd: 0,
                unique_dex_count: 0,
                unique_pool_count: 0
            }
        };
    }
}

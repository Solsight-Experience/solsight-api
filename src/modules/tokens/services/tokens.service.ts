import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, FindOptionsOrder, FindOptionsOrderValue, FindOptionsWhere, ILike, In, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
import { Token } from "../entities/token.entity";
import { OhlcCandle } from "../entities/ohlc-candle.entity";
import { Holder } from "../entities/holder.entity";
import { TokenResponseDto, TokenDetailsResponseDto, TokenMetadata } from "../dtos/token.response.dto";
import { SolanaService } from "../../../infra/solana/solana.service";
import { JupiterService } from "../../../infra/jupiter/jupiter.service";
import { CoinGeckoService } from "../../../infra/coingecko/coingecko.service";
import { TokenFilterConditionDto, TokenFilterResponseDto } from "../dtos/token.filter.dto";
import { mapJupiterTokenToEntity, mapTokenEntityToResponseDto, mapTokenEntityToOverviewDto } from "../mapper/token.mapper";
import { ChartQueryDto, ChartResponseDto } from "../dtos/token.chart.dto";
import { OhlcAggregationService } from "./aggregation/ohlc-aggregation.service";
import { StatsAggregationService } from "./aggregation/stats-aggregation.service";
import { OhlcInterval } from "./socket/room/room.constants";
import { RedisService } from "../../../redis/services/redis.service";
import { TradeData } from "../types/swap-event.types";
import { ClusterProvider } from "../../../common/cluster/cluster.provider";
import { HolderAggregationService } from "./aggregation/holder-aggregation.service";
import { EnrichedHolder } from "../types/holder-aggregation.types";

@Injectable()
export class TokensService {
    private readonly logger = new Logger(TokensService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        @InjectRepository(OhlcCandle)
        private readonly ohlcCandleRepository: Repository<OhlcCandle>,
        @InjectRepository(Holder)
        private readonly holderRepository: Repository<Holder>,
        private readonly clusterProvider: ClusterProvider,
        private readonly solanaService: SolanaService,
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService,
        private readonly ohlcAggregationService: OhlcAggregationService,
        private readonly statsAggregationService: StatsAggregationService,
        private readonly holderAggregationService: HolderAggregationService,
        private readonly redisService: RedisService
    ) {}

    private get network(): string {
        return this.clusterProvider.cluster;
    }

    private async cacheTokenMetadata(token: {
        address: string;
        symbol: string;
        name: string;
        logoUri?: string | null;
        decimals: number;
        coingeckoId?: string | null;
    }): Promise<void> {
        const meta: TokenMetadata = {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            logoUri: token.logoUri ?? null,
            decimals: token.decimals,
            coingeckoId: token.coingeckoId ?? null
        };
        await this.redisService.set(RedisService.KEYS.TOKEN_METADATA(this.network, token.address), JSON.stringify(meta), RedisService.TTL.TOKEN_METADATA);
    }

    async getTokenMetadata(address: string): Promise<TokenMetadata | null> {
        const cached = await this.redisService.get<string>(RedisService.KEYS.TOKEN_METADATA(this.network, address));
        if (cached) {
            try {
                return JSON.parse(cached) as TokenMetadata;
            } catch {
                // corrupted cache, fall through to DB
            }
        }

        const token = await this.tokenRepository.findOne({
            where: { address, network: this.network },
            select: ["address", "symbol", "name", "logoUri", "decimals", "coingeckoId"]
        });

        if (!token) return null;

        const meta: TokenMetadata = {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            logoUri: token.logoUri ?? null,
            decimals: token.decimals,
            coingeckoId: token.coingeckoId ?? null
        };
        await this.redisService.set(RedisService.KEYS.TOKEN_METADATA(this.network, address), JSON.stringify(meta), RedisService.TTL.TOKEN_METADATA);
        return meta;
    }

    async findOne(address: string): Promise<TokenResponseDto | null> {
        let token = await this.tokenRepository.findOneBy({ address, network: this.network });

        if (!token) {
            const tokenData = await this.resolveTokenData(address);
            if (!tokenData) {
                return null;
            }

            await this.updateToken(address, tokenData);
            token = await this.tokenRepository.findOneBy({ address, network: this.network });
        }

        if (!token) {
            return null;
        }

        await this.cacheTokenMetadata(token);

        return mapTokenEntityToResponseDto(token, this.network);
    }

    private async resolveTokenData(address: string): Promise<Partial<Token> | null> {
        const mintDecimals = await this.solanaService.getMintDecimals(address);
        const jupiterToken = await this.jupiterService.searchToken(address);

        if (!jupiterToken && mintDecimals === null) {
            return null;
        }

        const tokenData: Partial<Token> = jupiterToken
            ? mapJupiterTokenToEntity(jupiterToken)
            : {
                  address,
                  symbol: address.slice(0, 8),
                  name: address,
                  logoUri: undefined
              };

        tokenData.address = address;
        tokenData.decimals = mintDecimals ?? tokenData.decimals;

        if (jupiterToken) {
            const coingeckoId = await this.coinGeckoService.findCoinGeckoId(jupiterToken.symbol, jupiterToken.name);
            if (coingeckoId) {
                tokenData.coingeckoId = coingeckoId;
            }
        }

        return tokenData;
    }

    async findMany(addresses: string[]): Promise<Map<string, TokenMetadata>> {
        const result = new Map<string, TokenMetadata>();
        if (addresses.length === 0) return result;

        const uncached: string[] = [];
        for (const addr of addresses) {
            const cached = await this.redisService.get<string>(RedisService.KEYS.TOKEN_METADATA(this.network, addr));
            if (cached) {
                try {
                    result.set(addr, JSON.parse(cached) as TokenMetadata);
                    continue;
                } catch {
                    // corrupted cache, fall through
                }
            }
            uncached.push(addr);
        }

        if (uncached.length === 0) return result;

        const tokens = await this.tokenRepository.find({
            where: { address: In(uncached), network: this.network },
            select: ["address", "symbol", "name", "logoUri", "decimals", "coingeckoId"]
        });

        for (const t of tokens) {
            const meta: TokenMetadata = {
                address: t.address,
                symbol: t.symbol,
                name: t.name,
                logoUri: t.logoUri ?? null,
                decimals: t.decimals,
                coingeckoId: t.coingeckoId ?? null
            };
            result.set(t.address, meta);
            this.cacheTokenMetadata(t).catch(() => {});
        }

        const missing = uncached.filter((a) => !result.has(a));
        for (const addr of missing) {
            try {
                await this.findOne(addr);
                const token = await this.tokenRepository.findOne({
                    where: { address: addr, network: this.network },
                    select: ["address", "symbol", "name", "logoUri", "decimals", "coingeckoId"]
                });
                if (token) {
                    result.set(addr, {
                        address: token.address,
                        symbol: token.symbol,
                        name: token.name,
                        logoUri: token.logoUri ?? null,
                        decimals: token.decimals,
                        coingeckoId: token.coingeckoId ?? null
                    });
                }
            } catch {
                // Skip tokens that can't be resolved
            }
        }

        return result;
    }

    async search(query: string, limit: number = 10): Promise<TokenDetailsResponseDto[]> {
        const tokens = await this.tokenRepository.find({
            where: [
                { name: ILike(`%${query}%`), network: this.network },
                { symbol: ILike(`%${query}%`), network: this.network },
                { address: ILike(`%${query}%`), network: this.network }
            ],
            take: limit
        });

        return tokens.map((token) => mapTokenEntityToResponseDto(token, this.network));
    }

    async filter(
        filter: TokenFilterConditionDto,
        limit: number = 10,
        sort_by: string,
        sort_order?: "asc" | "desc",
        offset?: number
    ): Promise<TokenFilterResponseDto> {
        const orderValue: FindOptionsOrderValue = sort_order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
        const SortByMap = {
            market_cap: "marketCap",
            volume_24h: "volume24h",
            txns_24h: "txns24hTotal",
            holders: "holdersCount",
            age: "ageSeconds",
            price_change_24h: "priceChange24h"
        } as const;
        const column = SortByMap[sort_by as keyof typeof SortByMap];
        const whereConditions: FindOptionsWhere<Token> = { network: this.network };

        // Treat 0 as "not set" — 0 is the default unset value from the filter form.
        const rangeOp = (min: number | null | undefined, max: number | null | undefined) => {
            const lo = min != null && min !== 0 ? min : null;
            const hi = max != null && max !== 0 ? max : null;
            if (lo !== null && hi !== null) return Between(lo, hi);
            if (lo !== null) return MoreThanOrEqual(lo);
            if (hi !== null) return LessThanOrEqual(hi);
            return undefined;
        };

        if (filter?.metrics) {
            const m = filter.metrics;
            whereConditions.ageSeconds = rangeOp(
                m.age_min_minutes != null ? m.age_min_minutes * 60 : null,
                m.age_max_minutes != null ? m.age_max_minutes * 60 : null
            );
            whereConditions.liquidity = rangeOp(m.liquidity_min, m.liquidity_max);
            whereConditions.marketCap = rangeOp(m.market_cap_min, m.market_cap_max);
            whereConditions.volume24h = rangeOp(m.volume_24h_min, m.volume_24h_max);
            whereConditions.txns24hTotal = rangeOp(m.txns_24h_min, m.txns_24h_max);
            whereConditions.holdersCount = rangeOp(m.holders_min, m.holders_max);
            whereConditions.priceChange24h = rangeOp(m.price_change_24h_min, m.price_change_24h_max);
        }

        if (filter?.holder_filters) {
            const h = filter.holder_filters;
            if (h.top_10_max_percent != null) whereConditions.top10Percent = LessThanOrEqual(h.top_10_max_percent);
            if (h.insider_max_percent != null) whereConditions.insiderPercent = LessThanOrEqual(h.insider_max_percent);
        }

        if (filter?.audit_filters) {
            const a = filter.audit_filters;
            if (a.mint_authority_disabled) whereConditions.mintAuthorityDisabled = true;
            if (a.freeze_authority_disabled) whereConditions.freezeAuthorityDisabled = true;
            if (a.lp_burnt) whereConditions.lpBurnt = true;
            if (a.has_social_links) whereConditions.hasSocialLinks = true;
        }

        if (filter?.categories?.length > 0) {
            whereConditions.category = { slug: In(filter.categories) };
        }

        const where = filter?.search_query
            ? [
                  { ...whereConditions, name: ILike(`%${filter.search_query}%`) },
                  { ...whereConditions, symbol: ILike(`%${filter.search_query}%`) },
                  { ...whereConditions, address: ILike(`%${filter.search_query}%`) }
              ]
            : whereConditions;

        const tokens = await this.tokenRepository.find({
            take: limit,
            skip: offset,
            relations: ["category"],
            order: column ? ({ [column]: orderValue } as FindOptionsOrder<Token>) : undefined,
            where
        });

        const responseTokens = tokens.map((token) => mapTokenEntityToOverviewDto(token, this.network));

        return {
            tokens: responseTokens,
            total: responseTokens.length,
            filter_applied: filter
        };
    }

    private parseIntervalMs(interval: string): number {
        const value = parseInt(interval, 10);
        const unit = interval.slice(-1);
        const unitMap: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };
        return value * (unitMap[unit] ?? 1000);
    }

    private calcDays(interval: string, limit: number): number {
        const totalMs = this.parseIntervalMs(interval) * limit;
        const daysByInterval = Math.max(1, Math.ceil(totalMs / 86_400_000));
        const daysByCount = Math.ceil(limit / 6);
        const raw = Math.max(daysByInterval, daysByCount);
        const validDays = [1, 7, 14, 30, 90, 180, 365];
        return validDays.find((d) => d >= raw) ?? 365;
    }

    private readonly REALTIME_INTERVALS: OhlcInterval[] = ["10s", "1m", "5m"];

    async getChartData(address: string, query: ChartQueryDto): Promise<ChartResponseDto> {
        const { interval, limit = 500 } = query;
        const limitNum = Number(limit);
        const { from, to } = this.resolveChartWindow(interval, limitNum, query.from, query.to);

        if (this.REALTIME_INTERVALS.includes(interval as OhlcInterval)) {
            const raw = await this.ohlcAggregationService.getHistoricalOhlc(address, interval as OhlcInterval, limitNum, from, to);
            const redisPoints = raw.map((p) => ({
                timestamp: p.timestamp,
                open: p.open,
                high: p.high,
                low: p.low,
                close: p.close,
                volume: p.volume ?? 0
            }));

            const persistedPoints = this.mapCandles(
                await this.ohlcCandleRepository.find({
                    where: { tokenMint: address, network: this.network, interval, timestamp: Between(from, to) },
                    order: { timestamp: "ASC" }
                })
            );
            const pointsByTimestamp = new Map<number, (typeof redisPoints)[number]>();
            for (const point of persistedPoints) {
                pointsByTimestamp.set(point.timestamp, point);
            }
            for (const point of redisPoints) {
                pointsByTimestamp.set(point.timestamp, point);
            }
            const points = Array.from(pointsByTimestamp.values())
                .sort((a, b) => a.timestamp - b.timestamp)
                .slice(-limitNum);
            for (let i = 1; i < points.length; i++) {
                points[i].open = points[i - 1].close;
            }
            return { interval, points };
        }

        const days = this.resolveCoinGeckoDays(from, to, interval, limitNum);

        const cached = await this.ohlcCandleRepository.find({
            where: { tokenMint: address, network: this.network, interval, timestamp: Between(from, to) },
            order: { timestamp: "ASC" }
        });

        if (cached.length >= limitNum) {
            return { interval, points: this.mapCandles(cached.slice(-limitNum)) };
        }

        const token = await this.tokenRepository.findOne({ where: { address, network: this.network }, select: ["coingeckoId"] });
        if (!token?.coingeckoId) {
            return { interval, points: this.mapCandles(cached) };
        }

        try {
            const raw = await this.coinGeckoService.getOhlc(token.coingeckoId, "usd", days);
            if (raw.length === 0) {
                return { interval, points: this.mapCandles(cached) };
            }

            const candles = raw.map(([timestamp, open, high, low, close]) => ({
                tokenMint: address,
                network: this.network,
                interval,
                timestamp,
                open,
                high,
                low,
                close,
                volume: 0
            }));
            await this.ohlcCandleRepository.createQueryBuilder().insert().into(OhlcCandle).values(candles).orIgnore().execute();

            const fresh = await this.ohlcCandleRepository.find({
                where: { tokenMint: address, network: this.network, interval, timestamp: Between(from, to) },
                order: { timestamp: "ASC" }
            });
            return { interval, points: this.mapCandles(fresh.slice(-limitNum)) };
        } catch (error) {
            this.logger.error(`Failed to fetch CoinGecko chart data for ${address}:`, error);
            return { interval, points: this.mapCandles(cached) };
        }
    }

    private mapCandles(candles: OhlcCandle[]) {
        const points = candles.map((c) => ({
            timestamp: Number(c.timestamp),
            open: Number(c.open),
            high: Number(c.high),
            low: Number(c.low),
            close: Number(c.close),
            volume: Number(c.volume)
        }));

        for (let i = 1; i < points.length; i++) {
            points[i].open = points[i - 1].close;
        }

        return points;
    }

    private resolveChartWindow(interval: string, limit: number, from?: number, to?: number): { from: number; to: number } {
        const end = Number.isFinite(Number(to)) ? Number(to) : Date.now();
        const start = Number.isFinite(Number(from)) ? Number(from) : end - this.calcDays(interval, limit) * 86_400_000;
        return { from: Math.min(start, end), to: Math.max(start, end) };
    }

    private resolveCoinGeckoDays(from: number, to: number, interval: string, limit: number): number {
        const requestedDays = Math.max(1, Math.ceil((to - from) / 86_400_000));
        const fallbackDays = this.calcDays(interval, limit);
        const raw = Math.max(requestedDays, fallbackDays);
        const validDays = [1, 7, 14, 30, 90, 180, 365];
        return validDays.find((d) => d >= raw) ?? 365;
    }

    async getTrades(address: string, limit = 50): Promise<{ trades: TradeData[]; total: number }> {
        return this.statsAggregationService.getTrades(address, limit);
    }

    async getHolders(address: string, limit = 50): Promise<EnrichedHolder[]> {
        const holders = await this.holderRepository.find({
            where: { tokenMint: address, network: this.network },
            order: { balance: "DESC" },
            take: Math.min(limit, 500)
        });

        return this.holderAggregationService.enrichHolders(
            address,
            this.network,
            holders.map((holder) => ({
                wallet: holder.wallet,
                balance: holder.balance,
                lastActiveTs: holder.lastActiveTs,
                totalBoughtUsd: holder.totalBoughtUsd,
                totalSoldUsd: holder.totalSoldUsd,
                buyTxCount: holder.buyTxCount,
                sellTxCount: holder.sellTxCount
            }))
        );
    }

    async updateToken(address: string, data: Partial<Token>) {
        const token = await this.tokenRepository.upsert({ address, network: this.network, ...data }, ["address", "network"]);
        await this.redisService.del(RedisService.KEYS.TOKEN_METADATA(this.network, address));
        return token;
    }
}

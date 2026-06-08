import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, FindOptionsOrderValue, ILike, In, Repository } from "typeorm";
import { Token } from "../entities/token.entity";
import { OhlcCandle } from "../entities/ohlc-candle.entity";
import { TokenResponseDto, TokenDetailsResponseDto, TokenMetadata } from "../dtos/token.response.dto";
import { SolanaService } from "src/infra/solana/solana.service";
import { JupiterService } from "src/infra/jupiter/jupiter.service";
import { CoinGeckoService } from "src/infra/coingecko/coingecko.service";
import { TokenFilterConditionDto, TokenFilterResponseDto } from "../dtos/token.filter.dto";
import { mapJupiterTokenToEntity, mapTokenEntityToResponseDto, mapTokenEntityToOverviewDto } from "../mapper/token.mapper";
import { ChartQueryDto, ChartResponseDto } from "../dtos/token.chart.dto";
import { OhlcAggregationService } from "./aggregation/ohlc-aggregation.service";
import { StatsAggregationService } from "./aggregation/stats-aggregation.service";
import { OhlcInterval } from "./socket/room/room.constants";
import { RedisService } from "src/redis/services/redis.service";
import { TradeData } from "../types/swap-event.type";
import { COMMON_TOKEN_MINT } from "../constants/token.constant";
import { SolPriceResponseDto } from "../dtos/sol-price.response.dto";
import { ClusterProvider } from "src/common/cluster/cluster.provider";

const TOKEN_META_KEY = (network: string, address: string) => `token:meta:${network}:${address}`;
const TOKEN_META_TTL = 24 * 60 * 60;
const PRICE_TTL_S = 60 * 60;
const STALE_THRESHOLD_S = 5 * 60;
const FRESH_MIN_TTL_S = PRICE_TTL_S - STALE_THRESHOLD_S;

@Injectable()
export class TokensService {
    private readonly logger = new Logger(TokensService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        @InjectRepository(OhlcCandle)
        private readonly ohlcCandleRepository: Repository<OhlcCandle>,
        private readonly clusterProvider: ClusterProvider,
        private readonly solanaService: SolanaService,
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService,
        private readonly ohlcAggregationService: OhlcAggregationService,
        private readonly statsAggregationService: StatsAggregationService,
        private readonly redisService: RedisService
    ) {}

    private get network(): string {
        return this.clusterProvider.cluster;
    }

    async getSolPrice(): Promise<SolPriceResponseDto> {
        const priceKey = `price:${COMMON_TOKEN_MINT.SOL}:latest`;
        const cached = await this.redisService.hgetall(priceKey);

        if (cached?.price_usd) {
            const priceUsd = parseFloat(cached.price_usd);
            if (priceUsd > 0) {
                const ttl = await this.redisService.ttl(priceKey);
                const isStale = ttl >= 0 && ttl < FRESH_MIN_TTL_S;
                if (!isStale) {
                    return { price_usd: priceUsd, source: "redis" };
                }
                this.logger.debug(`Redis SOL price stale (ttl=${ttl}s), falling back to CoinGecko`);
            }
        }

        try {
            const prices = await this.coinGeckoService.getSimplePrice(["solana"]);
            const priceUsd = (prices as Record<string, { usd?: number }>)["solana"]?.usd ?? 0;
            return { price_usd: priceUsd, source: "coingecko" };
        } catch (error) {
            this.logger.error("Failed to fetch SOL price from CoinGecko", error);
            return { price_usd: 0, source: "coingecko" };
        }
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
        await this.redisService.set(TOKEN_META_KEY(this.network, token.address), JSON.stringify(meta), TOKEN_META_TTL);
    }

    async getTokenMetadata(address: string): Promise<TokenMetadata | null> {
        const cached = await this.redisService.get<string>(TOKEN_META_KEY(this.network, address));
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
        await this.redisService.set(TOKEN_META_KEY(this.network, address), JSON.stringify(meta), TOKEN_META_TTL);
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

    /**
     * Batch-fetch USD price + 24h change for the given token addresses.
     *
     * Source priority per token:
     *   1. Redis hash `price:{mint}:latest` (populated by indexer swap aggregation)
     *   2. `tokens.price` / `tokens.priceChange24h` columns (CoinGecko-seeded fallback)
     *
     * Tokens with no price data resolve to `{ priceUsd: 0, priceChange24h: 0 }`.
     * Returns a map keyed by mint address so callers can do their own joins.
     */
    async getPrices(addresses: string[]): Promise<Map<string, { priceUsd: number; priceChange24h: number }>> {
        const result = new Map<string, { priceUsd: number; priceChange24h: number }>();
        if (addresses.length === 0) return result;

        const needFallback: string[] = [];

        await Promise.all(
            addresses.map(async (addr) => {
                try {
                    const cached = await this.redisService.hgetall(`price:${addr}:latest`);
                    if (cached?.price_usd) {
                        const priceUsd = parseFloat(cached.price_usd);
                        if (Number.isFinite(priceUsd) && priceUsd > 0) {
                            result.set(addr, { priceUsd, priceChange24h: 0 });
                            return;
                        }
                    }
                } catch (error) {
                    this.logger.debug(`Redis price lookup failed for ${addr}: ${(error as Error).message}`);
                }
                needFallback.push(addr);
            })
        );

        if (needFallback.length > 0) {
            const tokens = await this.tokenRepository.find({
                where: { address: In(needFallback), network: this.network },
                select: ["address", "price", "priceChange24h"]
            });

            for (const t of tokens) {
                const priceUsd = Number(t.price) || 0;
                const priceChange24h = Number(t.priceChange24h) || 0;
                result.set(t.address, { priceUsd, priceChange24h });
            }
        }

        for (const addr of addresses) {
            if (!result.has(addr)) {
                result.set(addr, { priceUsd: 0, priceChange24h: 0 });
            }
        }

        return result;
    }

    async findMany(addresses: string[]): Promise<Map<string, TokenMetadata>> {
        const result = new Map<string, TokenMetadata>();
        if (addresses.length === 0) return result;

        const uncached: string[] = [];
        for (const addr of addresses) {
            const cached = await this.redisService.get<string>(TOKEN_META_KEY(this.network, addr));
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
        const column = SortByMap[sort_by];
        const whereConditions: any = { network: this.network };
        if (filter?.metrics) {
            const m = filter.metrics;

            if (m.age_min_minutes != null && m.age_max_minutes != null) {
                whereConditions.ageSeconds = Between(m.age_min_minutes, m.age_max_minutes);
            }

            if (m.liquidity_min != null && m.liquidity_max != null) {
                whereConditions.liquidity = Between(m.liquidity_min, m.liquidity_max);
            }

            if (m.market_cap_min != null && m.market_cap_max != null) {
                whereConditions.marketCap = Between(m.market_cap_min, m.market_cap_max);
            }

            if (m.volume_24h_min != null && m.volume_24h_max != null) {
                whereConditions.volume24h = Between(m.volume_24h_min, m.volume_24h_max);
            }

            if (m.txns_24h_min != null && m.txns_24h_max != null) {
                whereConditions.txns24hTotal = Between(m.txns_24h_min, m.txns_24h_max);
            }

            if (m.holders_min != null && m.holders_max != null) {
                whereConditions.holdersCount = Between(m.holders_min, m.holders_max);
            }

            if (m.price_change_24h_min != null && m.price_change_24h_max != null) {
                whereConditions.priceChange24h = Between(m.price_change_24h_min, m.price_change_24h_max);
            }
        }
        if (filter?.holder_filters) {
            const h = filter.holder_filters;

            if (h.top_10_max_percent != null) {
                whereConditions.top10Percent = Between(0, h.top_10_max_percent);
            }

            if (h.insider_max_percent != null) {
                whereConditions.insiderPercent = Between(0, h.insider_max_percent);
            }
        }
        const tokens = await this.tokenRepository.find({
            take: limit,
            skip: offset,
            relations: ["category"],
            order: column
                ? {
                      [column]: orderValue
                  }
                : undefined,
            where: [
                whereConditions,
                [
                    { name: ILike(`%${filter.search_query}%`), network: this.network },
                    { symbol: ILike(`%${filter.search_query}%`), network: this.network },
                    { address: ILike(`%${filter.search_query}%`), network: this.network }
                ]
            ]
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

        if (this.REALTIME_INTERVALS.includes(interval as OhlcInterval)) {
            const raw = await this.ohlcAggregationService.getHistoricalOhlc(address, interval as OhlcInterval, limitNum);
            const points = raw.map((p) => ({
                timestamp: p.timestamp,
                open: p.open,
                high: p.high,
                low: p.low,
                close: p.close,
                volume: p.volume ?? 0
            }));
            for (let i = 1; i < points.length; i++) {
                points[i].open = points[i - 1].close;
            }
            return { interval, points };
        }

        const days = this.calcDays(interval, limitNum);
        const to = Date.now();
        const from = to - days * 86_400_000;

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

    async getTrades(address: string, limit = 50): Promise<{ trades: TradeData[]; total: number }> {
        return this.statsAggregationService.getTrades(address, limit);
    }

    async updateToken(address: string, data: Partial<Token>) {
        const token = await this.tokenRepository.upsert({ address, network: this.network, ...data }, ["address", "network"]);
        await this.redisService.del(TOKEN_META_KEY(this.network, address));
        return token;
    }
}

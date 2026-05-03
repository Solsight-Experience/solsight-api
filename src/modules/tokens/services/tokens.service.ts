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

const TOKEN_META_KEY = (address: string) => `token:meta:${address}`;
const TOKEN_META_TTL = 24 * 60 * 60; // 24 hours

@Injectable()
export class TokensService {
    private readonly logger = new Logger(TokensService.name);
    private network: string;

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        @InjectRepository(OhlcCandle)
        private readonly ohlcCandleRepository: Repository<OhlcCandle>,
        private readonly solanaService: SolanaService,
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService,
        private readonly ohlcAggregationService: OhlcAggregationService,
        private readonly statsAggregationService: StatsAggregationService,
        private readonly redisService: RedisService
    ) {
        this.network = this.solanaService.getNetwork();
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
        await this.redisService.set(TOKEN_META_KEY(token.address), JSON.stringify(meta), TOKEN_META_TTL);
    }

    async getTokenMetadata(address: string): Promise<TokenMetadata | null> {
        const cached = await this.redisService.get<string>(TOKEN_META_KEY(address));
        if (cached) {
            try {
                return JSON.parse(cached) as TokenMetadata;
            } catch {
                // corrupted cache, fall through to DB
            }
        }

        const token = await this.tokenRepository.findOne({
            where: { address },
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
        await this.redisService.set(TOKEN_META_KEY(address), JSON.stringify(meta), TOKEN_META_TTL);
        return meta;
    }

    async findOne(address: string): Promise<TokenResponseDto | null> {
        let token = await this.tokenRepository.findOneBy({ address });

        if (!token) {
            const jupiterToken = await this.jupiterService.searchToken(address);
            if (!jupiterToken) {
                return null;
            }
            const tokenData = mapJupiterTokenToEntity(jupiterToken);

            // Try to find CoinGecko ID for this token
            const coingeckoId = await this.coinGeckoService.findCoinGeckoId(jupiterToken.symbol, jupiterToken.name);
            if (coingeckoId) {
                tokenData.coingeckoId = coingeckoId;
            }

            await this.updateToken(address, tokenData);
            token = await this.tokenRepository.findOneBy({ address });
        }

        if (!token) {
            return null;
        }

        await this.cacheTokenMetadata(token);

        return mapTokenEntityToResponseDto(token, this.network);
    }

    async findMany(addresses: string[]): Promise<Map<string, TokenMetadata>> {
        const result = new Map<string, TokenMetadata>();
        if (addresses.length === 0) return result;

        // 1. Check Redis cache first
        const uncached: string[] = [];
        for (const addr of addresses) {
            const cached = await this.redisService.get<string>(TOKEN_META_KEY(addr));
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

        // 2. Query DB for uncached addresses
        const tokens = await this.tokenRepository.find({
            where: { address: In(uncached) },
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

        // 3. For addresses not found in DB, try Jupiter fallback
        const missing = uncached.filter((a) => !result.has(a));
        for (const addr of missing) {
            try {
                await this.findOne(addr);
                const token = await this.tokenRepository.findOne({
                    where: { address: addr },
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
            where: [{ name: ILike(`%${query}%`) }, { symbol: ILike(`%${query}%`) }, { address: ILike(`%${query}%`) }],
            order: {
                volume24h: "DESC",
                marketCap: "DESC",
                liquidity: "DESC"
            },
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
        const whereConditions: any = {};
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
                [{ name: ILike(`%${filter.search_query}%`) }, { symbol: ILike(`%${filter.search_query}%`) }, { address: ILike(`%${filter.search_query}%`) }]
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
        // CoinGecko trả ~6 candles/ngày ở 4h granularity (days 2-90)
        const daysByCount = Math.ceil(limit / 6);
        const raw = Math.max(daysByInterval, daysByCount);
        // CoinGecko OHLC chỉ chấp nhận các giá trị cụ thể
        const validDays = [1, 7, 14, 30, 90, 180, 365];
        return validDays.find((d) => d >= raw) ?? 365;
    }

    private readonly REALTIME_INTERVALS: OhlcInterval[] = ["10s", "1m", "5m"];

    async getChartData(address: string, query: ChartQueryDto): Promise<ChartResponseDto> {
        const { interval, limit = 500 } = query;
        const limitNum = Number(limit);

        // Real-time intervals (10s/1m/5m): serve from Redis
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

        // Historical intervals: CoinGecko + DB
        const days = this.calcDays(interval, limitNum);
        const to = Date.now();
        const from = to - days * 86_400_000;

        // 1. Query DB theo range [from, to]
        const cached = await this.ohlcCandleRepository.find({
            where: { tokenMint: address, interval, timestamp: Between(from, to) },
            order: { timestamp: "ASC" }
        });

        if (cached.length >= limitNum) {
            return { interval, points: this.mapCandles(cached.slice(-limitNum)) };
        }

        // 2. Get coingeckoId from token DB
        const token = await this.tokenRepository.findOne({ where: { address }, select: ["coingeckoId"] });
        if (!token?.coingeckoId) {
            return { interval, points: this.mapCandles(cached) };
        }

        // 3. Fetch from CoinGecko để bổ sung
        try {
            const raw = await this.coinGeckoService.getOhlc(token.coingeckoId, "usd", days);
            if (raw.length === 0) {
                return { interval, points: this.mapCandles(cached) };
            }

            // 4. Upsert vào DB (ignore duplicates)
            const candles = raw.map(([timestamp, open, high, low, close]) => ({
                tokenMint: address,
                interval,
                timestamp,
                open,
                high,
                low,
                close,
                volume: 0
            }));
            await this.ohlcCandleRepository.createQueryBuilder().insert().into(OhlcCandle).values(candles).orIgnore().execute();

            // 5. Re-query DB theo cùng range [from, to]
            const fresh = await this.ohlcCandleRepository.find({
                where: { tokenMint: address, interval, timestamp: Between(from, to) },
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

        // Ensure close[i] == open[i+1] (candlestick continuity)
        for (let i = 1; i < points.length; i++) {
            points[i].open = points[i - 1].close;
        }

        return points;
    }

    async getTrades(address: string, limit = 50): Promise<{ trades: TradeData[]; total: number }> {
        return this.statsAggregationService.getTrades(address, limit);
    }

    async updateToken(address: string, data: Partial<Token>) {
        const token = await this.tokenRepository.upsert({ address, ...data }, ["address"]);
        // Invalidate metadata cache so next read picks up fresh data
        await this.redisService.del(TOKEN_META_KEY(address));
        return token;
    }
}

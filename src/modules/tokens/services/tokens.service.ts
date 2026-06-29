import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Brackets, FindOptionsOrder, FindOptionsOrderValue, FindOptionsWhere, ILike, In, LessThanOrEqual, MoreThanOrEqual, Repository } from "typeorm";
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
import { OhlcInterval } from "./socket/room/room.constants";
import { RedisService } from "../../../redis/services/redis.service";
import { TradeData } from "../types/swap-event.types";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { HolderAggregationService } from "./aggregation/holder-aggregation.service";
import type { HoldersResponseDto } from "../dtos/holder.response.dto";
import { Transaction, TransactionType } from "../../transactions/entities/transaction.entity";
import { TimeFrame } from "../../discovery/dtos/get-trending.dto";

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
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        private readonly solanaService: SolanaService,
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService,
        private readonly ohlcAggregationService: OhlcAggregationService,
        private readonly holderAggregationService: HolderAggregationService,
        private readonly redisService: RedisService
    ) {}

    private async cacheTokenMetadata(
        token: {
            address: string;
            symbol: string;
            name: string;
            logoUri?: string | null;
            decimals: number;
            coingeckoId?: string | null;
        },
        cluster: Cluster
    ): Promise<void> {
        const meta: TokenMetadata = {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            logoUri: token.logoUri ?? null,
            decimals: token.decimals,
            coingeckoId: token.coingeckoId ?? null
        };
        await this.redisService.set(RedisService.KEYS.TOKEN_METADATA(cluster, token.address), JSON.stringify(meta), RedisService.TTL.TOKEN_METADATA);
    }

    async getTokenMetadata(cluster: Cluster, address: string): Promise<TokenMetadata | null> {
        const cached = await this.redisService.get<string>(RedisService.KEYS.TOKEN_METADATA(cluster, address));
        if (cached) {
            try {
                return JSON.parse(cached) as TokenMetadata;
            } catch {
                // corrupted cache, fall through to DB
            }
        }

        const token = await this.tokenRepository.findOne({
            where: { address, network: cluster },
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
        await this.redisService.set(RedisService.KEYS.TOKEN_METADATA(cluster, address), JSON.stringify(meta), RedisService.TTL.TOKEN_METADATA);
        return meta;
    }

    async findOne(cluster: Cluster, address: string): Promise<TokenResponseDto | null> {
        let token = await this.tokenRepository.findOneBy({ address, network: cluster });

        if (!token) {
            const tokenData = await this.resolveTokenData(cluster, address);
            if (!tokenData) {
                return null;
            }

            await this.updateToken(cluster, address, tokenData);
            token = await this.tokenRepository.findOneBy({ address, network: cluster });
        }

        if (!token) {
            return null;
        }

        await this.cacheTokenMetadata(token, cluster);

        return mapTokenEntityToResponseDto(token, cluster);
    }

    private async resolveTokenData(cluster: Cluster, address: string): Promise<Partial<Token> | null> {
        const mintDecimals = await this.solanaService.getMintDecimals(cluster, address);
        const jupiterToken = cluster === "mainnet" ? await this.jupiterService.searchToken(cluster, address) : null;

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
            const coingeckoId = await this.coinGeckoService.findCoinGeckoId(cluster, jupiterToken.symbol, jupiterToken.name);
            if (coingeckoId) {
                tokenData.coingeckoId = coingeckoId;
            }
        }

        return tokenData;
    }

    async findMany(cluster: Cluster, addresses: string[]): Promise<Map<string, TokenMetadata>> {
        const result = new Map<string, TokenMetadata>();
        if (addresses.length === 0) return result;

        const uncached: string[] = [];
        for (const addr of addresses) {
            const cached = await this.redisService.get<string>(RedisService.KEYS.TOKEN_METADATA(cluster, addr));
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
            where: { address: In(uncached), network: cluster },
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
            this.cacheTokenMetadata(t, cluster).catch(() => {});
        }

        const missing = uncached.filter((a) => !result.has(a));
        for (const addr of missing) {
            try {
                await this.findOne(cluster, addr);
                const token = await this.tokenRepository.findOne({
                    where: { address: addr, network: cluster },
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

    async search(cluster: Cluster, query: string, limit: number = 10): Promise<TokenDetailsResponseDto[]> {
        const tokens = await this.tokenRepository.find({
            where: [
                { name: ILike(`%${query}%`), network: cluster },
                { symbol: ILike(`%${query}%`), network: cluster },
                { address: ILike(`%${query}%`), network: cluster }
            ],
            take: limit
        });

        return tokens.map((token) => mapTokenEntityToResponseDto(token, cluster));
    }

    private resolvePriceChangeColumn(time_frame: TimeFrame): keyof Token {
        if (time_frame === TimeFrame.SEVEN_DAYS) return "priceChange7d";
        if (
            time_frame === TimeFrame.ONE_HOUR ||
            time_frame === TimeFrame.FIVE_MINUTES ||
            time_frame === TimeFrame.FIFTEEN_MINUTES ||
            time_frame === TimeFrame.THIRTY_MINUTES ||
            time_frame === TimeFrame.SIX_HOURS
        )
            return "priceChange1h";
        return "priceChange24h";
    }

    private filterTimeFrameToMs(tf: TimeFrame): number {
        const map: Record<TimeFrame, number> = {
            [TimeFrame.FIVE_MINUTES]: 5 * 60 * 1000,
            [TimeFrame.FIFTEEN_MINUTES]: 15 * 60 * 1000,
            [TimeFrame.THIRTY_MINUTES]: 30 * 60 * 1000,
            [TimeFrame.ONE_HOUR]: 60 * 60 * 1000,
            [TimeFrame.SIX_HOURS]: 6 * 60 * 60 * 1000,
            [TimeFrame.TWENTY_FOUR_HOURS]: 24 * 60 * 60 * 1000,
            [TimeFrame.SEVEN_DAYS]: 7 * 24 * 60 * 60 * 1000
        };
        return map[tf];
    }

    async filter(
        cluster: Cluster,
        filter: TokenFilterConditionDto,
        limit: number = 10,
        sort_by: string,
        sort_order?: "asc" | "desc",
        offset?: number
    ): Promise<TokenFilterResponseDto> {
        const time_frame = filter?.time_frame ?? TimeFrame.TWENTY_FOUR_HOURS;
        const priceChangeColumn = this.resolvePriceChangeColumn(time_frame);
        const orderValue: FindOptionsOrderValue = sort_order?.toUpperCase() === "ASC" ? "ASC" : "DESC";

        const SortByMap: Record<string, string> = {
            market_cap: "marketCap",
            volume_24h: "volume24h",
            txns_24h: "txns24hTotal",
            holders: "holdersCount",
            age: "ageSeconds",
            price_change_24h: priceChangeColumn
        };

        const needsAggregation = time_frame !== TimeFrame.TWENTY_FOUR_HOURS;
        const hasVolumeFilter = filter?.metrics && (filter.metrics.volume_24h_min || filter.metrics.volume_24h_max);
        const hasTxnsFilter = filter?.metrics && (filter.metrics.txns_24h_min || filter.metrics.txns_24h_max);

        if (needsAggregation && (hasVolumeFilter || hasTxnsFilter)) {
            return this.filterWithAggregation(cluster, filter, limit, sort_by, sort_order, offset, time_frame, priceChangeColumn, SortByMap);
        }

        const column = SortByMap[sort_by];
        const whereConditions: FindOptionsWhere<Token> = { network: cluster };

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
            (whereConditions as Record<string, unknown>)[priceChangeColumn] = rangeOp(m.price_change_24h_min, m.price_change_24h_max);
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

        const responseTokens = tokens.map((token) => mapTokenEntityToOverviewDto(token, cluster));

        return {
            tokens: responseTokens,
            total: responseTokens.length,
            filter_applied: filter
        };
    }

    private async filterWithAggregation(
        cluster: Cluster,
        filter: TokenFilterConditionDto,
        limit: number,
        sort_by: string,
        sort_order: string | undefined,
        offset: number | undefined,
        time_frame: TimeFrame,
        priceChangeColumn: keyof Token,
        SortByMap: Record<string, string>
    ): Promise<TokenFilterResponseDto> {
        const fromMs = Date.now() - this.filterTimeFrameToMs(time_frame);
        const ohlcInterval = time_frame === TimeFrame.FIVE_MINUTES ? "1m" : "5m";
        const orderValue = sort_order?.toUpperCase() === "ASC" ? "ASC" : "DESC";

        const qb = this.tokenRepository
            .createQueryBuilder("token")
            .leftJoinAndSelect("token.category", "category")
            .where("token.network = :network", { network: cluster });

        qb.leftJoin(
            (sub) =>
                sub
                    .select("c.tokenMint", "mint")
                    .addSelect("COALESCE(SUM(c.volume), 0)", "agg_vol")
                    .from(OhlcCandle, "c")
                    .where("c.interval = :ohlcInterval")
                    .andWhere("c.timestamp >= :fromMs")
                    .andWhere("c.network = :ohlcNetwork")
                    .groupBy("c.tokenMint"),
            "ohlc_stats",
            "ohlc_stats.mint = token.address"
        )
            .setParameter("ohlcInterval", ohlcInterval)
            .setParameter("fromMs", fromMs)
            .setParameter("ohlcNetwork", cluster);

        qb.leftJoin(
            (sub) =>
                sub
                    .select("t.tokenMint", "mint")
                    .addSelect("COUNT(*)", "agg_cnt")
                    .from(Transaction, "t")
                    .where("t.blockTime >= :txFrom")
                    .andWhere("t.type = :swapType")
                    .groupBy("t.tokenMint"),
            "tx_stats",
            "tx_stats.mint = token.address"
        )
            .setParameter("txFrom", new Date(fromMs))
            .setParameter("swapType", TransactionType.SWAP);

        if (filter?.metrics) {
            const m = filter.metrics;
            const applyRange = (expr: string, min: number | null | undefined, max: number | null | undefined, tag: string) => {
                const lo = min != null && min !== 0 ? min : null;
                const hi = max != null && max !== 0 ? max : null;
                if (lo !== null && hi !== null) qb.andWhere(`${expr} BETWEEN :${tag}Lo AND :${tag}Hi`, { [`${tag}Lo`]: lo, [`${tag}Hi`]: hi });
                else if (lo !== null) qb.andWhere(`${expr} >= :${tag}Lo`, { [`${tag}Lo`]: lo });
                else if (hi !== null) qb.andWhere(`${expr} <= :${tag}Hi`, { [`${tag}Hi`]: hi });
            };

            const ageMin = m.age_min_minutes != null ? m.age_min_minutes * 60 : null;
            const ageMax = m.age_max_minutes != null ? m.age_max_minutes * 60 : null;
            applyRange("token.ageSeconds", ageMin, ageMax, "age");
            applyRange("token.liquidity", m.liquidity_min, m.liquidity_max, "liq");
            applyRange("token.marketCap", m.market_cap_min, m.market_cap_max, "mc");
            applyRange(`token.${priceChangeColumn}`, m.price_change_24h_min, m.price_change_24h_max, "pc");
            applyRange("token.holdersCount", m.holders_min, m.holders_max, "holders");
            applyRange("COALESCE(ohlc_stats.agg_vol, 0)", m.volume_24h_min, m.volume_24h_max, "vol");
            applyRange("CAST(COALESCE(tx_stats.agg_cnt, 0) AS bigint)", m.txns_24h_min, m.txns_24h_max, "txns");
        }

        if (filter?.holder_filters) {
            const h = filter.holder_filters;
            if (h.top_10_max_percent != null) qb.andWhere("token.top10Percent <= :top10", { top10: h.top_10_max_percent });
            if (h.insider_max_percent != null) qb.andWhere("token.insiderPercent <= :insider", { insider: h.insider_max_percent });
        }

        if (filter?.audit_filters) {
            const a = filter.audit_filters;
            if (a.mint_authority_disabled) qb.andWhere("token.mintAuthorityDisabled = true");
            if (a.freeze_authority_disabled) qb.andWhere("token.freezeAuthorityDisabled = true");
            if (a.lp_burnt) qb.andWhere("token.lpBurnt = true");
            if (a.has_social_links) qb.andWhere("token.hasSocialLinks = true");
        }

        if (filter?.categories?.length > 0) {
            qb.andWhere("category.slug IN (:...cats)", { cats: filter.categories });
        }

        if (filter?.search_query) {
            qb.andWhere(
                new Brackets((bqb) => {
                    bqb.where("token.name ILIKE :sq", { sq: `%${filter.search_query}%` })
                        .orWhere("token.symbol ILIKE :sq")
                        .orWhere("token.address ILIKE :sq");
                })
            );
        }

        if (sort_by === "volume_24h") {
            qb.orderBy("ohlc_stats.agg_vol", orderValue, "NULLS LAST");
        } else if (sort_by === "txns_24h") {
            qb.orderBy("tx_stats.agg_cnt", orderValue, "NULLS LAST");
        } else {
            const col = SortByMap[sort_by];
            if (col) qb.orderBy(`token.${col}`, orderValue);
        }

        const total = await qb.getCount();
        const tokens = await qb
            .limit(limit)
            .offset(offset ?? 0)
            .getMany();

        return {
            tokens: tokens.map((t) => mapTokenEntityToOverviewDto(t, cluster)),
            total,
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

    async getChartData(cluster: Cluster, address: string, query: ChartQueryDto): Promise<ChartResponseDto> {
        const { interval, limit = 500 } = query;
        const limitNum = Number(limit);
        const { from, to } = this.resolveChartWindow(interval, limitNum, query.from, query.to);

        if (this.REALTIME_INTERVALS.includes(interval as OhlcInterval)) {
            const raw = await this.ohlcAggregationService.getHistoricalOhlc(cluster, address, interval as OhlcInterval, limitNum, from, to);
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
                    where: { tokenMint: address, network: cluster, interval, timestamp: Between(from, to) },
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
            where: { tokenMint: address, network: cluster, interval, timestamp: Between(from, to) },
            order: { timestamp: "ASC" }
        });

        if (cached.length >= limitNum) {
            return { interval, points: this.mapCandles(cached.slice(-limitNum)) };
        }

        if (cluster === "devnet") {
            return { interval, points: this.mapCandles(cached) };
        }

        const token = await this.tokenRepository.findOne({ where: { address, network: cluster }, select: ["coingeckoId"] });
        if (!token?.coingeckoId) {
            return { interval, points: this.mapCandles(cached) };
        }

        try {
            const raw = await this.coinGeckoService.getOhlc(cluster, token.coingeckoId, "usd", days);
            if (raw.length === 0) {
                return { interval, points: this.mapCandles(cached) };
            }

            const candles = raw.map(([timestamp, open, high, low, close]) => ({
                tokenMint: address,
                network: cluster,
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
                where: { tokenMint: address, network: cluster, interval, timestamp: Between(from, to) },
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

    async getTrades(cluster: Cluster, address: string, limit = 50): Promise<{ trades: TradeData[]; total: number }> {
        const [rows, total] = await this.transactionRepository.findAndCount({
            where: [
                { tokenMint: address, network: cluster, type: TransactionType.SWAP },
                { tokenMintOut: address, network: cluster, type: TransactionType.SWAP }
            ],
            order: { blockTime: "DESC" },
            take: limit
        });

        const trades: TradeData[] = rows.map((tx) => {
            const isBuy = tx.tokenMintOut === address;
            return {
                tx_hash: tx.signature,
                timestamp: tx.blockTime ? Math.floor(tx.blockTime.getTime() / 1000) : 0,
                type: isBuy ? "BUY" : "SELL",
                amount_token: isBuy ? Number(tx.amountOut ?? 0) : Number(tx.amount),
                amount_sol: isBuy ? Number(tx.amount) : Number(tx.amountOut ?? 0),
                price: Number(tx.metadata?.price_native ?? 0),
                price_usd: Number(tx.metadata?.price_usd ?? 0),
                market_cap: 0,
                trader_address: tx.signerAddress ?? "",
                tx_url: `https://solscan.io/tx/${tx.signature}`
            };
        });

        return { trades, total };
    }

    async getHolders(cluster: Cluster, address: string, limit = 50): Promise<HoldersResponseDto> {
        const responseLimit = this.normalizeHoldersLimit(limit);
        const summaryLimit = Math.max(responseLimit, 20);
        const [holders, total] = await this.holderRepository.findAndCount({
            where: { tokenMint: address, network: cluster },
            order: { balance: "DESC" },
            take: summaryLimit
        });

        const enrichedHolders = await this.holderAggregationService.enrichHolders(
            address,
            cluster,
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

        return {
            holders: enrichedHolders.slice(0, responseLimit),
            total,
            summary: {
                total_holders: total,
                top_10_holding_percent: this.sumHoldingPercent(enrichedHolders, 10),
                top_20_holding_percent: this.sumHoldingPercent(enrichedHolders, 20)
            }
        };
    }

    async updateToken(cluster: Cluster, address: string, data: Partial<Token>) {
        const token = await this.tokenRepository.upsert({ address, network: cluster, ...data }, ["address", "network"]);
        await this.redisService.del(RedisService.KEYS.TOKEN_METADATA(cluster, address));
        return token;
    }

    private normalizeHoldersLimit(limit: number): number {
        const parsedLimit = Number(limit);
        if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) return 50;

        return Math.min(Math.trunc(parsedLimit), 500);
    }

    private sumHoldingPercent(holders: HoldersResponseDto["holders"], count: number): number {
        return holders.slice(0, count).reduce((sum, holder) => sum + holder.balance_percent, 0);
    }
}

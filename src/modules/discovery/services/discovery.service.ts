import { BadRequestException, Injectable, Logger, OnModuleInit, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository, SelectQueryBuilder } from "typeorm";
import { Token } from "../../tokens/entities/token.entity";
import { Category } from "../../tokens/entities/category.entity";
import { OhlcCandle } from "../../tokens/entities/ohlc-candle.entity";
import { Transaction, TransactionType } from "../../transactions/entities/transaction.entity";
import { GetTrendingDto, SortByTrending, TimeFrame } from "../dtos/get-trending.dto";
import { GetNewListingsDto } from "../dtos/get-new-listings.dto";
import { GetGainersLosersDto, GainersLosersType, GainersLosersTimeFrame } from "../dtos/get-gainers-losers.dto";
import { GetCategoryDto } from "../dtos/get-category.dto";
import { GetCategoryNamesDto } from "../dtos/get-category-names.dto";
import { CoinGeckoService } from "../../../infra/coingecko/coingecko.service";
import { TokenOverview, CategoryOverview, PaginatedCategoriesResponse } from "../dtos/discovery.response.dto";
import { RedisService } from "../../../redis";
import type { Cluster } from "../../../common/cluster/cluster.types";

const TRENDING_TTL = 60;
const CATEGORIES_TTL = 300;
const CATEGORY_DETAIL_TTL = 120;
const WINDOW_SIZE = 100;

@Injectable()
export class DiscoveryService implements OnModuleInit {
    private readonly logger = new Logger(DiscoveryService.name);

    constructor(
        private readonly coingeckoService: CoinGeckoService,
        private readonly redisService: RedisService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        @InjectRepository(Category)
        private readonly categoryRepository: Repository<Category>
    ) {}
    onModuleInit() {
        this.logger.log("DiscoveryService initialized. Checking if categories need sync...");
        this.syncCategoriesForCluster("mainnet").catch((err) => {
            this.logger.error("Failed to sync categories on startup", err);
        });
    }

    private validateRange(min: number | undefined, max: number | undefined, field: string): void {
        if (min !== undefined && max !== undefined && min > max) {
            throw new BadRequestException(`${field}_min must be less than or equal to ${field}_max`);
        }
    }

    private applyRange(query: SelectQueryBuilder<Token>, column: string, paramPrefix: string, min: number | undefined, max: number | undefined): void {
        if (min !== undefined && max !== undefined) {
            query.andWhere(`${column} BETWEEN :${paramPrefix}Min AND :${paramPrefix}Max`, {
                [`${paramPrefix}Min`]: min,
                [`${paramPrefix}Max`]: max
            });
        } else if (min !== undefined) {
            query.andWhere(`${column} >= :${paramPrefix}Min`, { [`${paramPrefix}Min`]: min });
        } else if (max !== undefined) {
            query.andWhere(`${column} <= :${paramPrefix}Max`, { [`${paramPrefix}Max`]: max });
        }
    }

    private transformToCategory(category: Category) {
        return {
            id: category.slug,
            name: category.name,
            market_cap: Number(category.marketCap),
            market_cap_change_24h: Number(category.marketCapChange24h),
            content: category.description || "",
            top_3_coins_id: category.top3CoinsId || [],
            top_3_coins: category.top3Coins || [],
            volume_24h: Number(category.volume24h),
            updated_at: category.updatedAt
        };
    }

    private transformToTokenOverview(token: Token, cluster: Cluster): TokenOverview {
        return {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            logo_uri: token.logoUri || "",
            network: cluster,
            category: token.category?.name || "",
            age_seconds: Number(token.ageSeconds) || 0,
            price: Number(token.price) || 0,
            price_change_1h: Number(token.priceChange1h) || 0,
            price_change_24h: Number(token.priceChange24h) || 0,
            price_change_7d: Number(token.priceChange7d) || 0,
            market_cap: Number(token.marketCap) || 0,
            market_cap_change_24h: Number(token.marketCapChange24h) || 0,
            fdv: Number(token.fdv) || 0,
            liquidity: Number(token.liquidity) || 0,
            liquidity_change_24h: Number(token.liquidityChange24h) || 0,
            volume_24h: Number(token.volume24h) || 0,
            volume_change_24h: Number(token.volumeChange24h) || 0,
            txns_24h: {
                total: Number(token.txns24hTotal) || 0,
                buys: Number(token.txns24hBuys) || 0,
                sells: Number(token.txns24hSells) || 0,
                change_24h: Number(token.txns24hChange) || 0
            },
            holders: {
                count: Number(token.holdersCount) || 0,
                change_24h: Number(token.holdersChange24h) || 0,
                unique_wallets_24h: Number(token.uniqueWallets24h) || 0,
                top_10_percent: Number(token.top10Percent) || 0,
                insider_percent: Number(token.insiderPercent) || 0
            },
            audit: {
                mint_authority_disabled: token.mintAuthorityDisabled ?? false,
                freeze_authority_disabled: token.freezeAuthorityDisabled ?? false,
                lp_burnt: token.lpBurnt ?? false,
                has_social_links: token.hasSocialLinks ?? false,
                holders_count: Number(token.holdersCount) || 0,
                unique_wallets_24h: Number(token.uniqueWallets24h) || 0,
                top_10_holders_percent: Number(token.top10Percent) || 0,
                insider_percent: Number(token.insiderPercent) || 0,
                risk_score: token.riskScore != null ? Number(token.riskScore) : 50
            },
            price_sparkline: token.priceSparkline || []
        };
    }

    private timeFrameToMs(tf: TimeFrame): number {
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

    // For a 5-minute window, use 1m candles instead of 5m: a 5m candle is written
    // to the DB only when its bucket closes, so the current (in-progress) candle may
    // not exist yet — leaving up to 5 minutes of volume missing. 1m candles close
    // more frequently, keeping the gap under 1 minute.
    private resolveOhlcInterval(tf: TimeFrame): string {
        if (tf === TimeFrame.FIVE_MINUTES) return "1m";
        return "5m";
    }

    // Returns true when sort needs aggregation from OHLC/transactions instead of pre-computed fields
    private needsCustomAggregation(sort_by: SortByTrending, time_frame: TimeFrame): boolean {
        if (time_frame === TimeFrame.TWENTY_FOUR_HOURS) return false;
        return sort_by === SortByTrending.VOLUME_24H || sort_by === SortByTrending.TXNS_24H;
    }

    private getTrendingOrderBy(sort_by: SortByTrending, time_frame: TimeFrame = TimeFrame.TWENTY_FOUR_HOURS): { [key: string]: "DESC" | "ASC" } {
        switch (sort_by) {
            case SortByTrending.VOLUME_24H:
                return { volume24h: "DESC" };
            case SortByTrending.TXNS_24H:
                return { txns24hTotal: "DESC" };
            case SortByTrending.PRICE_CHANGE_24H:
                if (time_frame === TimeFrame.SEVEN_DAYS) return { priceChange7d: "DESC" };
                if (
                    time_frame === TimeFrame.ONE_HOUR ||
                    time_frame === TimeFrame.FIVE_MINUTES ||
                    time_frame === TimeFrame.FIFTEEN_MINUTES ||
                    time_frame === TimeFrame.THIRTY_MINUTES ||
                    time_frame === TimeFrame.SIX_HOURS
                )
                    return { priceChange1h: "DESC" };
                return { priceChange24h: "DESC" };
            case SortByTrending.MARKET_CAP:
                return { marketCap: "DESC" };
            case SortByTrending.HOLDERS_CHANGE:
                return { holdersChange24h: "DESC" };
            default:
                return { volume24h: "DESC" };
        }
    }

    private async getTrendingWithAggregation(
        cluster: Cluster,
        sort_by: SortByTrending,
        time_frame: TimeFrame,
        limit: number,
        offset: number
    ): Promise<{ tokens: TokenOverview[]; total: number; updated_at: string }> {
        const fromMs = Date.now() - this.timeFrameToMs(time_frame);

        const qb = this.tokenRepository
            .createQueryBuilder("token")
            .leftJoinAndSelect("token.category", "category")
            .where("token.network = :network", { network: cluster });

        if (sort_by === SortByTrending.VOLUME_24H) {
            const ohlcInterval = this.resolveOhlcInterval(time_frame);
            qb.leftJoin(
                (subQuery) =>
                    subQuery
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
        } else if (sort_by === SortByTrending.TXNS_24H) {
            qb.leftJoin(
                (subQuery) =>
                    subQuery
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
        }

        // getCount() must run before orderBy — virtual subquery aliases (ohlc_stats,
        // tx_stats) have no TypeORM entity metadata; adding orderBy first causes
        // createOrderByCombinedWithSelectExpression to throw when building COUNT.
        const total = await qb.getCount();

        if (sort_by === SortByTrending.VOLUME_24H) {
            qb.orderBy("ohlc_stats.agg_vol", "DESC", "NULLS LAST");
        } else if (sort_by === SortByTrending.TXNS_24H) {
            qb.orderBy("tx_stats.agg_cnt", "DESC", "NULLS LAST");
        }

        // Use limit()/offset() instead of take()/skip() — take/skip triggers TypeORM's
        // complex pagination subquery which calls createOrderByCombinedWithSelectExpression
        // and tries to resolve virtual subquery aliases as entity metadata → crashes.
        const tokens = await qb.limit(limit).offset(offset).getMany();

        return {
            tokens: tokens.map((t) => this.transformToTokenOverview(t, cluster)),
            total,
            updated_at: new Date().toISOString()
        };
    }

    async getTrending(cluster: Cluster, dto: GetTrendingDto) {
        const {
            sort_by = SortByTrending.VOLUME_24H,
            time_frame = TimeFrame.TWENTY_FOUR_HOURS,
            limit = 20,
            offset = 0,
            min_liquidity,
            max_liquidity,
            min_market_cap,
            max_market_cap,
            min_volume_24h,
            max_volume_24h,
            min_txns_24h,
            max_txns_24h,
            min_holders,
            max_holders
        } = dto;

        this.validateRange(min_liquidity, max_liquidity, "liquidity");
        this.validateRange(min_market_cap, max_market_cap, "market_cap");
        this.validateRange(min_volume_24h, max_volume_24h, "volume_24h");
        this.validateRange(min_txns_24h, max_txns_24h, "txns_24h");
        this.validateRange(min_holders, max_holders, "holders");

        // Custom aggregation path: VOLUME or TXNS with non-24h time frame
        if (this.needsCustomAggregation(sort_by, time_frame)) {
            return this.getTrendingWithAggregation(cluster, sort_by, time_frame, limit, offset);
        }

        const hasFilters = [
            min_liquidity,
            max_liquidity,
            min_market_cap,
            max_market_cap,
            min_volume_24h,
            max_volume_24h,
            min_txns_24h,
            max_txns_24h,
            min_holders,
            max_holders
        ].some((v) => v !== undefined);

        if (hasFilters) {
            const orderBy = this.getTrendingOrderBy(sort_by, time_frame);
            const [orderColumn, orderDir] = Object.entries(orderBy)[0];

            const query = this.tokenRepository
                .createQueryBuilder("token")
                .leftJoinAndSelect("token.category", "category")
                .where("token.network = :network", { network: cluster });

            this.applyRange(query, "token.liquidity", "liquidity", min_liquidity, max_liquidity);
            this.applyRange(query, "token.marketCap", "marketCap", min_market_cap, max_market_cap);
            this.applyRange(query, "token.volume24h", "volume24h", min_volume_24h, max_volume_24h);
            this.applyRange(query, "token.txns24hTotal", "txns24h", min_txns_24h, max_txns_24h);
            this.applyRange(query, "token.holdersCount", "holders", min_holders, max_holders);

            query.orderBy(`token.${orderColumn}`, orderDir).take(limit).skip(offset);

            const [tokens, total] = await query.getManyAndCount();
            return {
                tokens: tokens.map((t) => this.transformToTokenOverview(t, cluster)),
                total,
                updated_at: new Date().toISOString()
            };
        }

        const startWindow = Math.floor(offset / WINDOW_SIZE);
        const endWindow = Math.floor((offset + limit - 1) / WINDOW_SIZE);

        const windowData: TokenOverview[][] = [];

        for (let w = startWindow; w <= endWindow; w++) {
            const windowKey = RedisService.KEYS.DISCOVERY_TRENDING_WINDOW(cluster, sort_by, time_frame, w);
            let window = await this.redisService.get<TokenOverview[]>(windowKey);

            if (!window) {
                const tokens = await this.tokenRepository.find({
                    where: { network: cluster },
                    order: this.getTrendingOrderBy(sort_by, time_frame),
                    take: WINDOW_SIZE,
                    skip: w * WINDOW_SIZE,
                    relations: ["category"]
                });
                window = tokens.map((t) => this.transformToTokenOverview(t, cluster));
                await this.redisService.set(windowKey, window, TRENDING_TTL);
            }
            windowData.push(window);
        }

        const totalKey = RedisService.KEYS.DISCOVERY_TRENDING_TOTAL(cluster, sort_by, time_frame);
        let total = await this.redisService.get<number>(totalKey);
        if (total === null) {
            total = await this.tokenRepository.count({ where: { network: cluster } });
            await this.redisService.set(totalKey, total, TRENDING_TTL);
        }

        const combined = windowData.flat();
        const startInCombined = offset - startWindow * WINDOW_SIZE;

        return {
            tokens: combined.slice(startInCombined, startInCombined + limit),
            total,
            updated_at: new Date().toISOString()
        };
    }

    async getNewListings(cluster: Cluster, dto: GetNewListingsDto) {
        const {
            time_frame,
            min_liquidity,
            max_liquidity,
            min_market_cap,
            max_market_cap,
            min_volume_24h,
            max_volume_24h,
            min_txns_24h,
            max_txns_24h,
            min_holders,
            max_holders,
            limit,
            offset
        } = dto;

        this.validateRange(min_liquidity, max_liquidity, "liquidity");
        this.validateRange(min_market_cap, max_market_cap, "market_cap");
        this.validateRange(min_volume_24h, max_volume_24h, "volume_24h");
        this.validateRange(min_txns_24h, max_txns_24h, "txns_24h");
        this.validateRange(min_holders, max_holders, "holders");

        let ageThresholdSeconds = 86400;
        if (time_frame === TimeFrame.SEVEN_DAYS) {
            ageThresholdSeconds = 604800;
        }

        const query = this.tokenRepository
            .createQueryBuilder("token")
            .leftJoinAndSelect("token.category", "category")
            .where("token.network = :network", { network: cluster })
            .andWhere("token.ageSeconds <= :ageThreshold", { ageThreshold: ageThresholdSeconds })
            .orderBy("token.createdAt", "DESC");

        this.applyRange(query, "token.liquidity", "liquidity", min_liquidity, max_liquidity);
        this.applyRange(query, "token.marketCap", "marketCap", min_market_cap, max_market_cap);
        this.applyRange(query, "token.volume24h", "volume24h", min_volume_24h, max_volume_24h);
        this.applyRange(query, "token.txns24hTotal", "txns24h", min_txns_24h, max_txns_24h);
        this.applyRange(query, "token.holdersCount", "holders", min_holders, max_holders);

        query.take(limit).skip(offset);

        const [tokens, total] = await query.getManyAndCount();

        return {
            tokens: tokens.map((token) => this.transformToTokenOverview(token, cluster)),
            total
        };
    }

    async getCategories(_cluster: Cluster, dto: GetCategoryDto): Promise<PaginatedCategoriesResponse> {
        const { limit = 10, offset = 0, name, market_cap_min, market_cap_max, volume_min, volume_max, sort_by = "market_cap", sort_order = "desc" } = dto;

        this.validateRange(market_cap_min, market_cap_max, "market_cap");
        this.validateRange(volume_min, volume_max, "volume");

        const hasFilter = name || market_cap_min !== undefined || market_cap_max !== undefined || volume_min !== undefined || volume_max !== undefined;
        const hasCustomSort = sort_by !== "market_cap" || sort_order !== "desc";

        if (hasFilter || hasCustomSort) {
            const SORT_COLUMN_MAP: Record<string, string> = { market_cap: "marketCap", volume_24h: "volume24h", name: "name" };

            const qb = this.categoryRepository
                .createQueryBuilder("cat")
                .where("cat.marketCap > 0")
                .andWhere("cat.volume24h > 0")
                .andWhere("cat.top3Coins IS NOT NULL AND cat.top3Coins != ''")
                .andWhere("cat.top3CoinsId IS NOT NULL AND cat.top3CoinsId != ''");

            if (name) qb.andWhere("cat.name ILIKE :name", { name: `%${name}%` });
            if (market_cap_min !== undefined) qb.andWhere("cat.marketCap >= :mcMin", { mcMin: market_cap_min });
            if (market_cap_max !== undefined) qb.andWhere("cat.marketCap <= :mcMax", { mcMax: market_cap_max });
            if (volume_min !== undefined) qb.andWhere("cat.volume24h >= :vMin", { vMin: volume_min });
            if (volume_max !== undefined) qb.andWhere("cat.volume24h <= :vMax", { vMax: volume_max });

            const col = SORT_COLUMN_MAP[sort_by] ?? "marketCap";
            qb.orderBy(`cat.${col}`, sort_order === "asc" ? "ASC" : "DESC")
                .skip(offset)
                .take(limit);

            const [categories, total] = await qb.getManyAndCount();

            return {
                data: categories.map((cat) => this.transformToCategory(cat)),
                total,
                limit,
                offset
            };
        }

        const startWindow = Math.floor(offset / WINDOW_SIZE);
        const endWindow = Math.floor((offset + limit - 1) / WINDOW_SIZE);

        const windowData: CategoryOverview[][] = [];

        for (let w = startWindow; w <= endWindow; w++) {
            const windowKey = RedisService.KEYS.DISCOVERY_CATEGORIES_WINDOW(w);
            let window = await this.redisService.get<CategoryOverview[]>(windowKey);

            if (!window) {
                await this.populateCategoryWindows();
                window = (await this.redisService.get<CategoryOverview[]>(windowKey)) ?? [];
            }
            windowData.push(window);
        }

        const total = (await this.redisService.get<number>(RedisService.KEYS.DISCOVERY_CATEGORIES_TOTAL())) ?? 0;

        const combined = windowData.flat();
        const startInCombined = offset - startWindow * WINDOW_SIZE;

        return {
            data: combined.slice(startInCombined, startInCombined + limit),
            total,
            limit,
            offset
        };
    }

    async getCategoryNames(dto: GetCategoryNamesDto): Promise<{ data: { id: string; name: string }[]; total: number; limit: number; offset: number }> {
        const { limit = 20, offset = 0, name, sort_order = "asc" } = dto;

        const qb = this.categoryRepository.createQueryBuilder("cat").select(["cat.slug", "cat.name"]);

        if (name) qb.andWhere("cat.name ILIKE :name", { name: `%${name}%` });

        qb.orderBy("cat.name", sort_order === "desc" ? "DESC" : "ASC")
            .skip(offset)
            .take(limit);

        const [categories, total] = await qb.getManyAndCount();

        return {
            data: categories.map((cat) => ({ id: cat.slug, name: cat.name })),
            total,
            limit,
            offset
        };
    }

    private async populateCategoryWindows(): Promise<void> {
        const categories = await this.categoryRepository.find({ order: { marketCap: "DESC" } });

        const valid: CategoryOverview[] = categories
            .filter((cat) => Number(cat.marketCap) > 0 && Number(cat.volume24h) > 0 && cat.top3Coins?.length > 0 && cat.top3CoinsId?.length > 0)
            .map((cat) => this.transformToCategory(cat));

        await this.redisService.set(RedisService.KEYS.DISCOVERY_CATEGORIES_TOTAL(), valid.length, CATEGORIES_TTL);

        for (let i = 0; i < valid.length; i += WINDOW_SIZE) {
            const windowIndex = Math.floor(i / WINDOW_SIZE);
            await this.redisService.set(RedisService.KEYS.DISCOVERY_CATEGORIES_WINDOW(windowIndex), valid.slice(i, i + WINDOW_SIZE), CATEGORIES_TTL);
        }
    }

    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async syncCategories(): Promise<void> {
        await this.syncCategoriesForCluster("mainnet");
    }

    async syncCategoriesForCluster(cluster: Cluster): Promise<void> {
        await this.coingeckoService.clearCategoriesCache(cluster);

        try {
            this.logger.log("Starting categories sync...");

            const categories = await this.coingeckoService.getCategories(cluster);

            if (!categories || categories.length === 0) {
                this.logger.warn("No categories found from CoinGecko");
                return;
            }

            for (const cat of categories) {
                if (
                    !cat.name ||
                    !cat.market_cap ||
                    !cat.volume_24h ||
                    !cat.top_3_coins ||
                    cat.top_3_coins.length === 0 ||
                    !cat.top_3_coins_id ||
                    cat.top_3_coins_id.length === 0
                ) {
                    continue;
                }

                const categoryData = {
                    slug: cat.id,
                    name: cat.name,
                    description: cat.content || "",
                    marketCap: cat.market_cap,
                    marketCapChange24h: cat.market_cap_change_24h || 0,
                    volume24h: cat.volume_24h,
                    top3Coins: cat.top_3_coins,
                    top3CoinsId: cat.top_3_coins_id
                };

                await this.categoryRepository.upsert(categoryData, {
                    conflictPaths: ["slug"],
                    skipUpdateIfNoValuesChanged: true
                });
            }

            this.logger.log(`Synced ${categories.length} categories from CoinGecko`);

            const windowKeys = await this.redisService.keys("discovery:categories:*");
            const detailKeys = await this.redisService.keys("discovery:category:*");
            for (const key of [...windowKeys, ...detailKeys]) {
                await this.redisService.del(key);
            }
        } catch (error) {
            this.logger.error("Failed to sync categories", error);
        }
    }

    async getCategoryDetail(_cluster: Cluster, categorySlug: string, _dto: GetCategoryDto) {
        const cacheKey = RedisService.KEYS.DISCOVERY_CATEGORY_DETAIL(categorySlug);

        const cached = await this.redisService.get(cacheKey);
        if (cached) return cached;

        const category = await this.categoryRepository.findOne({
            where: { slug: categorySlug }
        });

        if (!category) {
            throw new NotFoundException("Category not found");
        }

        const transformedCategory = this.transformToCategory(category);
        await this.redisService.set(cacheKey, transformedCategory, CATEGORY_DETAIL_TTL);
        return transformedCategory;
    }

    async getGainersLosers(cluster: Cluster, dto: GetGainersLosersDto) {
        const { type, limit, time_frame } = dto;

        let orderByField = "priceChange24h";
        if (time_frame === GainersLosersTimeFrame.ONE_HOUR) {
            orderByField = "priceChange1h";
        } else if (time_frame === GainersLosersTimeFrame.SEVEN_DAYS) {
            orderByField = "priceChange7d";
        }

        let gainers: Token[] = [];
        let losers: Token[] = [];

        if (type === GainersLosersType.GAINERS || type === GainersLosersType.BOTH) {
            gainers = await this.tokenRepository.find({
                where: { network: cluster, [orderByField]: Not(IsNull()) },
                order: { [orderByField]: "DESC" },
                take: limit,
                relations: ["category"]
            });
        }

        if (type === GainersLosersType.LOSERS || type === GainersLosersType.BOTH) {
            losers = await this.tokenRepository.find({
                where: { network: cluster, [orderByField]: Not(IsNull()) },
                order: { [orderByField]: "ASC" },
                take: limit,
                relations: ["category"]
            });
        }

        const transformedGainers = gainers.map((token) => this.transformToTokenOverview(token, cluster));
        const transformedLosers = losers.map((token) => this.transformToTokenOverview(token, cluster));

        return {
            gainers: transformedGainers,
            losers: transformedLosers,
            updated_at: new Date().toISOString()
        };
    }
}

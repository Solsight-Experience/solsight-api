import { BadRequestException, Injectable, Logger, OnModuleInit, NotFoundException } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { ClsService } from "nestjs-cls";
import { IsNull, Not, Repository, SelectQueryBuilder } from "typeorm";
import { Token } from "../../tokens/entities/token.entity";
import { Category } from "../../tokens/entities/category.entity";
import { GetTrendingDto, SortByTrending, TimeFrame } from "../dtos/get-trending.dto";
import { GetNewListingsDto } from "../dtos/get-new-listings.dto";
import { GetGainersLosersDto, GainersLosersType, GainersLosersTimeFrame } from "../dtos/get-gainers-losers.dto";
import { GetCategoryDto } from "../dtos/get-category.dto";
import { JupiterService } from "../../../infra/jupiter/jupiter.service";
import { CoinGeckoService } from "../../../infra/coingecko/coingecko.service";
import { SolanaService } from "../../../infra/solana/solana.service";
import { TokenOverview, CategoryOverview, PaginatedCategoriesResponse } from "../dtos/discovery.response.dto";
import { RedisService } from "../../../redis";
import { ClusterProvider, CLUSTER_CLS_KEY } from "../../../common/cluster/cluster.provider";
import { JupiterTokenV2 } from "../../../infra/jupiter/types";

const TRENDING_TTL = 60;
const CATEGORIES_TTL = 300;
const CATEGORY_DETAIL_TTL = 120;
const WINDOW_SIZE = 100;

@Injectable()
export class DiscoveryService implements OnModuleInit {
    private readonly logger = new Logger(DiscoveryService.name);

    constructor(
        private readonly jupiterService: JupiterService,
        private readonly coingeckoService: CoinGeckoService,
        private readonly solanaService: SolanaService,
        private readonly redisService: RedisService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        @InjectRepository(Category)
        private readonly categoryRepository: Repository<Category>,
        private readonly clusterProvider: ClusterProvider,
        private readonly cls: ClsService
    ) {}
    onModuleInit() {
        this.logger.log("DiscoveryService initialized. Checking if categories need sync...");
        this.syncCategories().catch((err) => {
            this.logger.error("Failed to sync categories on startup", err);
        });
    }

    private get network(): string {
        return this.clusterProvider.cluster;
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

    private transformToTokenOverview(token: Token): TokenOverview {
        return {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            logo_uri: token.logoUri || "",
            network: this.network,
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

    private getTrendingOrderBy(sort_by: SortByTrending): { [key: string]: "DESC" | "ASC" } {
        switch (sort_by) {
            case SortByTrending.VOLUME_24H:
                return { volume24h: "DESC" };
            case SortByTrending.TXNS_24H:
                return { txns24hTotal: "DESC" };
            case SortByTrending.PRICE_CHANGE_24H:
                return { priceChange24h: "DESC" };
            case SortByTrending.MARKET_CAP:
                return { marketCap: "DESC" };
            case SortByTrending.HOLDERS_CHANGE:
                return { holdersChange24h: "DESC" };
            default:
                return { volume24h: "DESC" };
        }
    }

    async getTrending(dto: GetTrendingDto) {
        const {
            sort_by = SortByTrending.VOLUME_24H,
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
            const orderBy = this.getTrendingOrderBy(sort_by);
            const [orderColumn, orderDir] = Object.entries(orderBy)[0];

            const query = this.tokenRepository
                .createQueryBuilder("token")
                .leftJoinAndSelect("token.category", "category")
                .where("token.network = :network", { network: this.network });

            this.applyRange(query, "token.liquidity", "liquidity", min_liquidity, max_liquidity);
            this.applyRange(query, "token.marketCap", "marketCap", min_market_cap, max_market_cap);
            this.applyRange(query, "token.volume24h", "volume24h", min_volume_24h, max_volume_24h);
            this.applyRange(query, "token.txns24hTotal", "txns24h", min_txns_24h, max_txns_24h);
            this.applyRange(query, "token.holdersCount", "holders", min_holders, max_holders);

            query.orderBy(`token.${orderColumn}`, orderDir).take(limit).skip(offset);

            const [tokens, total] = await query.getManyAndCount();
            return {
                tokens: tokens.map((t) => this.transformToTokenOverview(t)),
                total,
                updated_at: new Date().toISOString()
            };
        }

        const startWindow = Math.floor(offset / WINDOW_SIZE);
        const endWindow = Math.floor((offset + limit - 1) / WINDOW_SIZE);

        let synced = false;
        const windowData: TokenOverview[][] = [];

        for (let w = startWindow; w <= endWindow; w++) {
            const windowKey = RedisService.KEYS.DISCOVERY_TRENDING_WINDOW(this.network, sort_by, w);
            let window = await this.redisService.get<TokenOverview[]>(windowKey);

            if (!window) {
                if (!synced) {
                    await this.syncTrendingTokens();
                    synced = true;
                }
                const tokens = await this.tokenRepository.find({
                    where: { network: this.network },
                    order: this.getTrendingOrderBy(sort_by),
                    take: WINDOW_SIZE,
                    skip: w * WINDOW_SIZE,
                    relations: ["category"]
                });
                window = tokens.map((t) => this.transformToTokenOverview(t));
                await this.redisService.set(windowKey, window, TRENDING_TTL);
            }
            windowData.push(window);
        }

        const totalKey = RedisService.KEYS.DISCOVERY_TRENDING_TOTAL(this.network, sort_by);
        let total = await this.redisService.get<number>(totalKey);
        if (total === null) {
            total = await this.tokenRepository.count({ where: { network: this.network } });
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

    @Cron(CronExpression.EVERY_5_MINUTES)
    async syncTrendingTokens(): Promise<void> {
        return this.cls.run(async () => {
            this.cls.set(CLUSTER_CLS_KEY, "mainnet");
            try {
                const trendingData = await this.coingeckoService.getTrendingCoins();
                if (!trendingData || !trendingData.coins) {
                    this.logger.warn("No trending data from CoinGecko");
                    return;
                }

                this.logger.log(`Fetched ${trendingData.coins.length} trending coins from CoinGecko`);

                let solanaTokenMap = new Map<string, JupiterTokenV2>();
                try {
                    const jupiterTokens = await this.jupiterService.getTokenList();
                    if (jupiterTokens.length > 0) {
                        solanaTokenMap = new Map(jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]));
                        this.logger.log(`Loaded ${jupiterTokens.length} tokens from Jupiter`);
                    }
                } catch {
                    this.logger.warn("Jupiter API unavailable, proceeding without Solana matching");
                }

                const coinIds = trendingData.coins.slice(0, 20).map((c) => c.item.id);
                const marketData = await this.coingeckoService.getCoinsMarketData(coinIds);
                const marketDataMap = new Map(marketData.map((m) => [m.id, m]));

                const tokensToUpsert: object[] = [];
                for (const item of trendingData.coins.slice(0, 20)) {
                    const symbol = item.item.symbol.toUpperCase();
                    const market = marketDataMap.get(item.item.id);
                    if (!market) continue;

                    const jupiterToken = solanaTokenMap.get(item.item.symbol.toLowerCase());
                    if (!jupiterToken) {
                        this.logger.debug(`Skipping ${symbol} - not found on Solana`);
                        continue;
                    }

                    tokensToUpsert.push({
                        symbol,
                        name: item.item.name,
                        address: jupiterToken.id,
                        network: this.network,
                        price: market.current_price || 0,
                        priceChange1h: market.price_change_percentage_1h_in_currency || 0,
                        priceChange24h: market.price_change_percentage_24h || 0,
                        priceChange7d: market.price_change_percentage_7d_in_currency || 0,
                        marketCap: market.market_cap || 0,
                        marketCapChange24h: market.market_cap_change_percentage_24h || 0,
                        volume24h: market.total_volume || 0,
                        logoUri: item.item.large || market.image,
                        coingeckoId: item.item.id,
                        circulatingSupply: market.circulating_supply || 0,
                        totalSupply: market.total_supply || 0,
                        maxSupply: market.max_supply || 0,
                        fdv: market.fully_diluted_valuation || 0
                    });
                }

                if (tokensToUpsert.length > 0) {
                    await this.tokenRepository.upsert(tokensToUpsert, {
                        conflictPaths: ["address", "network"],
                        skipUpdateIfNoValuesChanged: true
                    });
                }

                this.logger.log(`Synced ${tokensToUpsert.length} trending tokens from CoinGecko`);
            } catch (error) {
                this.logger.error("Failed to sync trending tokens", error);
            }
        });
    }

    async getNewListings(dto: GetNewListingsDto) {
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
            .where("token.network = :network", { network: this.network })
            .andWhere("token.ageSeconds <= :ageThreshold", { ageThreshold: ageThresholdSeconds })
            .orderBy("token.createdAt", "DESC");

        this.applyRange(query, "token.liquidity", "liquidity", min_liquidity, max_liquidity);
        this.applyRange(query, "token.marketCap", "marketCap", min_market_cap, max_market_cap);
        this.applyRange(query, "token.volume24h", "volume24h", min_volume_24h, max_volume_24h);
        this.applyRange(query, "token.txns24hTotal", "txns24h", min_txns_24h, max_txns_24h);
        this.applyRange(query, "token.holdersCount", "holders", min_holders, max_holders);

        query.take(limit).skip(offset);

        const [tokens, total] = await query.getManyAndCount();

        const transformedTokens = tokens.map((token) => this.transformToTokenOverview(token));

        return {
            tokens: transformedTokens,
            total
        };
    }

    @Cron(CronExpression.EVERY_10_MINUTES)
    async syncNewListings(): Promise<void> {
        return this.cls.run(async () => {
            this.cls.set(CLUSTER_CLS_KEY, "mainnet");
            try {
                this.logger.log("Starting new listings sync...");

                const recentCoins = await this.coingeckoService.getRecentlyAddedCoins(50);
                if (!recentCoins || recentCoins.length === 0) {
                    this.logger.warn("No recent coins found from CoinGecko");
                    return;
                }

                let solanaTokenMap = new Map<string, JupiterTokenV2>();
                try {
                    const jupiterTokens = await this.jupiterService.getTokenList();
                    if (jupiterTokens.length > 0) {
                        solanaTokenMap = new Map(jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]));
                    }
                } catch {
                    this.logger.warn("Jupiter API unavailable for new listings sync");
                    return;
                }

                const tokensToUpsert: object[] = [];
                for (const coin of recentCoins) {
                    const jupiterToken = solanaTokenMap.get(coin.symbol.toLowerCase());
                    if (!jupiterToken) continue;

                    tokensToUpsert.push({
                        address: jupiterToken.id,
                        network: this.network,
                        name: coin.name,
                        symbol: coin.symbol.toUpperCase(),
                        logoUri: coin.image,
                        price: coin.current_price,
                        priceChange1h: coin.price_change_percentage_1h_in_currency || 0,
                        priceChange24h: coin.price_change_percentage_24h || 0,
                        priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
                        marketCap: coin.market_cap,
                        marketCapChange24h: coin.market_cap_change_percentage_24h || 0,
                        volume24h: coin.total_volume,
                        circulatingSupply: coin.circulating_supply,
                        totalSupply: coin.total_supply,
                        maxSupply: coin.max_supply,
                        coingeckoId: coin.id,
                        ageSeconds: 3600,
                        liquidity: coin.total_volume || 0
                    });
                }

                if (tokensToUpsert.length > 0) {
                    await this.tokenRepository.upsert(tokensToUpsert, {
                        conflictPaths: ["address", "network"],
                        skipUpdateIfNoValuesChanged: true
                    });
                }

                this.logger.log(`Synced ${tokensToUpsert.length} Solana new listings from CoinGecko`);
            } catch (error) {
                this.logger.error("Failed to sync new listings", error);
            }
        });
    }

    async getCategories(dto: GetCategoryDto): Promise<PaginatedCategoriesResponse> {
        const { limit = 10, offset = 0 } = dto;

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
        return this.cls.run(async () => {
            this.cls.set(CLUSTER_CLS_KEY, "mainnet");
            try {
                this.logger.log("Starting categories sync...");

                await this.coingeckoService["cacheManager"].del("cg-categories");
                const categories = await this.coingeckoService.getCategories();

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
        });
    }

    async getCategoryDetail(categorySlug: string, _dto: GetCategoryDto) {
        const cacheKey = RedisService.KEYS.DISCOVERY_CATEGORY_DETAIL(categorySlug);

        const cached = await this.redisService.get(cacheKey);
        if (cached) return cached;

        const category = await this.categoryRepository.findOne({
            where: { slug: categorySlug }
        });

        if (!category) {
            throw new NotFoundException("Category not found");
        }

        await this.syncCategoryTokens(categorySlug, category.id);

        const transformedCategory = this.transformToCategory(category);
        await this.redisService.set(cacheKey, transformedCategory, CATEGORY_DETAIL_TTL);
        return transformedCategory;
    }

    private async syncCategoryTokens(categorySlug: string, categoryId: string): Promise<void> {
        try {
            this.logger.log(`Starting token sync for category: ${categorySlug}...`);

            const coins = await this.coingeckoService.getCoinsByCategory(categorySlug);

            if (!coins || coins.length === 0) {
                this.logger.warn(`No coins found for category ${categorySlug}`);
                return;
            }

            let solanaTokenMap = new Map<string, JupiterTokenV2>();
            try {
                const jupiterTokens = await this.jupiterService.getTokenList();
                if (jupiterTokens.length > 0) {
                    solanaTokenMap = new Map(jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]));
                }
            } catch {
                this.logger.warn("Jupiter API unavailable for category sync");
            }

            let syncedCount = 0;
            for (const coin of coins) {
                const jupiterToken = solanaTokenMap.get(coin.symbol.toLowerCase());

                if (!jupiterToken) {
                    continue;
                }

                const tokenData = {
                    address: jupiterToken.id,
                    network: this.network,
                    name: coin.name,
                    symbol: coin.symbol.toUpperCase(),
                    logoUri: coin.image,
                    price: coin.current_price,
                    priceChange1h: coin.price_change_percentage_1h_in_currency || 0,
                    priceChange24h: coin.price_change_percentage_24h || 0,
                    priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
                    marketCap: coin.market_cap,
                    marketCapChange24h: coin.market_cap_change_percentage_24h || 0,
                    volume24h: coin.total_volume,
                    circulatingSupply: coin.circulating_supply,
                    totalSupply: coin.total_supply,
                    maxSupply: coin.max_supply,
                    categoryId: categoryId,
                    coingeckoId: coin.id
                };

                await this.tokenRepository.upsert(tokenData, {
                    conflictPaths: ["address", "network"],
                    skipUpdateIfNoValuesChanged: true
                });
                syncedCount++;
            }

            this.logger.log(`Synced ${syncedCount} Solana tokens for category ${categorySlug}`);
        } catch (error) {
            this.logger.error(`Failed to sync tokens for category ${categorySlug}`, error);
        }
    }

    async getGainersLosers(dto: GetGainersLosersDto) {
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
                where: { network: this.network, [orderByField]: Not(IsNull()) },
                order: { [orderByField]: "DESC" },
                take: limit,
                relations: ["category"]
            });
        }

        if (type === GainersLosersType.LOSERS || type === GainersLosersType.BOTH) {
            losers = await this.tokenRepository.find({
                where: { network: this.network, [orderByField]: Not(IsNull()) },
                order: { [orderByField]: "ASC" },
                take: limit,
                relations: ["category"]
            });
        }

        const transformedGainers = gainers.map((token) => this.transformToTokenOverview(token));
        const transformedLosers = losers.map((token) => this.transformToTokenOverview(token));

        return {
            gainers: transformedGainers,
            losers: transformedLosers,
            updated_at: new Date().toISOString()
        };
    }
}

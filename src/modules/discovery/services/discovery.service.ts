import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Cron, CronExpression } from "@nestjs/schedule";
import { Repository } from "typeorm";
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

const TRENDING_TTL = 60; // 1 minute
const CATEGORIES_TTL = 300; // 5 minutes
const CATEGORY_DETAIL_TTL = 120; // 2 minutes

@Injectable()
export class DiscoveryService {
    private readonly logger = new Logger(DiscoveryService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        @InjectRepository(Category)
        private readonly categoryRepository: Repository<Category>,
        private readonly jupiterService: JupiterService,
        private readonly coingeckoService: CoinGeckoService,
        private readonly solanaService: SolanaService,
        private readonly redisService: RedisService
    ) {}

    /**
     * Transform Category entity to match CoinGecko format
     */
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

    /**
     * Transform Token entity to TokenOverview format
     */
    private transformToTokenOverview(token: Token): TokenOverview {
        return {
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            logo_uri: token.logoUri || "",
            network: "solana",
            category: token.category?.name || "",
            age_seconds: token.ageSeconds,
            price: token.price,
            price_change_1h: token.priceChange1h,
            price_change_24h: token.priceChange24h,
            price_change_7d: token.priceChange7d,
            market_cap: token.marketCap,
            market_cap_change_24h: token.marketCapChange24h,
            fdv: token.fdv,
            liquidity: token.liquidity,
            liquidity_change_24h: token.liquidityChange24h,
            volume_24h: token.volume24h,
            volume_change_24h: token.volumeChange24h,
            txns_24h: {
                total: token.txns24hTotal,
                buys: token.txns24hBuys,
                sells: token.txns24hSells,
                change_24h: token.txns24hChange
            },
            holders: {
                count: token.holdersCount,
                change_24h: token.holdersChange24h,
                unique_wallets_24h: token.uniqueWallets24h,
                top_10_percent: token.top10Percent,
                insider_percent: token.insiderPercent
            },
            audit: {
                mint_authority_disabled: token.mintAuthorityDisabled,
                freeze_authority_disabled: token.freezeAuthorityDisabled,
                lp_burnt: token.lpBurnt,
                has_social_links: token.hasSocialLinks,
                holders_count: token.holdersCount,
                unique_wallets_24h: token.uniqueWallets24h,
                top_10_holders_percent: token.top10Percent,
                insider_percent: token.insiderPercent,
                risk_score: token.riskScore
            },
            price_sparkline: token.priceSparkline || []
        };
    }

    async getTrending(dto: GetTrendingDto) {
        const { sort_by, time_frame, limit, offset } = dto;
        const cacheKey = `discovery:trending:${sort_by}:${time_frame}:${limit}:${offset}`;

        const cached = await this.redisService.get(cacheKey);
        if (cached) return cached;

        // Sync real-time data from external APIs before querying
        await this.syncTrendingTokens();

        let orderBy: { [key: string]: "DESC" | "ASC" } = {};

        switch (sort_by) {
            case SortByTrending.VOLUME_24H:
                orderBy = { volume24h: "DESC" };
                break;
            case SortByTrending.TXNS_24H:
                orderBy = { txns24hTotal: "DESC" };
                break;
            case SortByTrending.PRICE_CHANGE_24H:
                orderBy = { priceChange24h: "DESC" };
                break;
            case SortByTrending.MARKET_CAP:
                orderBy = { marketCap: "DESC" };
                break;
            case SortByTrending.HOLDERS_CHANGE:
                orderBy = { holdersChange24h: "DESC" };
                break;
            default:
                orderBy = { volume24h: "DESC" };
        }

        const [tokens, total] = await this.tokenRepository.findAndCount({
            order: orderBy,
            take: limit,
            skip: offset,
            relations: ["category"]
        });

        const transformedTokens = tokens.map((token) => this.transformToTokenOverview(token));

        const result = {
            tokens: transformedTokens,
            total,
            updated_at: new Date().toISOString()
        };
        await this.redisService.set(cacheKey, result, TRENDING_TTL);
        return result;
    }

    /**
     * Sync trending tokens from CoinGecko (with optional Jupiter for Solana tokens)
     */
    private async syncTrendingTokens(): Promise<void> {
        try {
            // Get trending coins from CoinGecko
            const trendingData = await this.coingeckoService.getTrendingCoins();
            if (!trendingData || !trendingData.coins) {
                this.logger.warn("No trending data from CoinGecko");
                return;
            }

            this.logger.log(`Fetched ${trendingData.coins.length} trending coins from CoinGecko`);

            // Try to get Jupiter token list (optional - may fail if network issues)
            let solanaTokenMap = new Map<string, any>();
            try {
                const jupiterTokens = await this.jupiterService.getTokenList();
                if (jupiterTokens.length > 0) {
                    solanaTokenMap = new Map(jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]));
                    this.logger.log(`Loaded ${jupiterTokens.length} tokens from Jupiter`);
                }
            } catch (error) {
                this.logger.warn("Jupiter API unavailable, proceeding without Solana matching");
            }

            // Get existing tokens from database
            const existingTokens = await this.tokenRepository.find();
            const existingTokenMap = new Map(existingTokens.map((t) => [t.symbol, t]));

            // Get market data from CoinGecko for top trending coins
            const coinIds = trendingData.coins.slice(0, 20).map((c) => c.item.id);
            const marketData = await this.coingeckoService.getCoinsMarketData(coinIds);
            const marketDataMap = new Map(marketData.map((m) => [m.id, m]));

            // Update or create tokens (only Solana tokens)
            let syncedCount = 0;
            for (const item of trendingData.coins.slice(0, 20)) {
                const symbol = item.item.symbol.toUpperCase();
                const market = marketDataMap.get(item.item.id);

                if (!market) continue;

                const jupiterToken = solanaTokenMap.get(item.item.symbol.toLowerCase());

                // Skip if not a Solana token
                if (!jupiterToken) {
                    this.logger.debug(`Skipping ${symbol} - not found on Solana`);
                    continue;
                }

                const existingToken = existingTokenMap.get(symbol);

                const tokenData = {
                    symbol,
                    name: item.item.name,
                    address: jupiterToken.address,
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
                };

                if (existingToken) {
                    await this.tokenRepository.update(existingToken.id, tokenData);
                } else {
                    await this.tokenRepository.save(tokenData);
                }
                syncedCount++;
            }

            this.logger.log(`Synced ${syncedCount} trending tokens from CoinGecko`);
        } catch (error) {
            this.logger.error("Failed to sync trending tokens", error);
        }
    }

    async getNewListings(dto: GetNewListingsDto) {
        // Sync new listings from CoinGecko first
        await this.syncNewListings();

        const { time_frame, min_liquidity, limit, offset } = dto;

        let ageThresholdSeconds = 86400; // 24h default
        if (time_frame === TimeFrame.SEVEN_DAYS) {
            ageThresholdSeconds = 604800; // 7 days
        }

        const query = this.tokenRepository
            .createQueryBuilder("token")
            .leftJoinAndSelect("token.category", "category")
            .where("token.ageSeconds <= :ageThreshold", {
                ageThreshold: ageThresholdSeconds
            })
            .orderBy("token.createdAt", "DESC");

        if (min_liquidity !== undefined) {
            query.andWhere("token.liquidity >= :minLiquidity", {
                minLiquidity: min_liquidity
            });
        }

        query.take(limit).skip(offset);

        const [tokens, total] = await query.getManyAndCount();

        const transformedTokens = tokens.map((token) => this.transformToTokenOverview(token));

        return {
            tokens: transformedTokens,
            total
        };
    }

    /**
     * Sync new listings from CoinGecko
     */
    private async syncNewListings(): Promise<void> {
        try {
            this.logger.log("Starting new listings sync...");

            // Fetch recently added coins from CoinGecko
            const recentCoins = await this.coingeckoService.getRecentlyAddedCoins(50);

            if (!recentCoins || recentCoins.length === 0) {
                this.logger.warn("No recent coins found from CoinGecko");
                return;
            }

            // Get Jupiter token list to verify Solana tokens
            let solanaTokenMap = new Map<string, any>();
            try {
                const jupiterTokens = await this.jupiterService.getTokenList();
                if (jupiterTokens.length > 0) {
                    solanaTokenMap = new Map(jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]));
                }
            } catch (error) {
                this.logger.warn("Jupiter API unavailable for new listings sync");
                return; // Skip if can't verify Solana tokens
            }

            // Process and save tokens (only Solana)
            let syncedCount = 0;
            for (const coin of recentCoins) {
                const jupiterToken = solanaTokenMap.get(coin.symbol.toLowerCase());

                // Skip if not a Solana token
                if (!jupiterToken) {
                    continue;
                }

                const tokenData = {
                    address: jupiterToken.address,
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
                    // New listings are typically recent, so set a low age
                    ageSeconds: 3600, // 1 hour default for new listings
                    liquidity: coin.total_volume || 0 // Use volume as proxy for liquidity
                };

                await this.tokenRepository.upsert(tokenData, {
                    conflictPaths: ["address"],
                    skipUpdateIfNoValuesChanged: true
                });
                syncedCount++;
            }

            this.logger.log(`Synced ${syncedCount} Solana new listings from CoinGecko`);
        } catch (error) {
            this.logger.error("Failed to sync new listings", error);
        }
    }

    async getCategories(dto: GetCategoryDto): Promise<PaginatedCategoriesResponse> {
        const { limit = 10, offset = 0 } = dto;
        const cacheKey = `discovery:categories:${limit}:${offset}`;

        const cached = await this.redisService.get<PaginatedCategoriesResponse>(cacheKey);
        if (cached) return cached;

        const [categories, total] = await this.categoryRepository.findAndCount({
            order: { marketCap: "DESC" },
            take: limit,
            skip: offset
        });

        // Filter out categories with missing or zero data
        const validCategories = categories.filter(
            (cat) =>
                Number(cat.marketCap) > 0 &&
                Number(cat.volume24h) > 0 &&
                cat.top3Coins &&
                cat.top3Coins.length > 0 &&
                cat.top3CoinsId &&
                cat.top3CoinsId.length > 0
        );

        const transformedCategories = validCategories.map((category) => this.transformToCategory(category));

        const result: PaginatedCategoriesResponse = {
            data: transformedCategories,
            total,
            limit,
            offset
        };
        await this.redisService.set(cacheKey, result, CATEGORIES_TTL);
        return result;
    }

    /**
     * Sync categories from CoinGecko
     * Runs daily at 00:00
     */
    @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
    async syncCategories(): Promise<void> {
        try {
            this.logger.log("Starting categories sync...");

            // Fetch categories from CoinGecko
            await this.coingeckoService["cacheManager"].del("cg-categories"); // Force clear cache
            const categories = await this.coingeckoService.getCategories();

            if (!categories || categories.length === 0) {
                this.logger.warn("No categories found from CoinGecko");
                return;
            }

            // Process and save categories
            for (const cat of categories) {
                // Skip if doesn't have required info per user request
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

            // Invalidate cached category responses so next requests get fresh data
            const staleKeys = await this.redisService.keys("discovery:categories:*");
            const staleCategoryKeys = await this.redisService.keys("discovery:category:*");
            for (const key of [...staleKeys, ...staleCategoryKeys]) {
                await this.redisService.del(key);
            }
        } catch (error) {
            this.logger.error("Failed to sync categories", error);
        }
    }

    async getCategoryDetail(categorySlug: string, dto: GetCategoryDto) {
        const { sort_by, limit, offset } = dto;
        const cacheKey = `discovery:category:${categorySlug}:${sort_by}:${limit}:${offset}`;

        const cached = await this.redisService.get(cacheKey);
        if (cached) return cached;

        const category = await this.categoryRepository.findOne({
            where: { slug: categorySlug }
        });

        if (!category) {
            throw new Error("Category not found");
        }

        // Sync tokens for this category
        await this.syncCategoryTokens(categorySlug, category.id);

        const transformedCategory = this.transformToCategory(category);
        await this.redisService.set(cacheKey, transformedCategory, CATEGORY_DETAIL_TTL);
        return transformedCategory;
    }

    /**
     * Sync tokens for a specific category from CoinGecko
     */
    private async syncCategoryTokens(categorySlug: string, categoryId: string): Promise<void> {
        try {
            this.logger.log(`Starting token sync for category: ${categorySlug}...`);

            // Fetch coins by category from CoinGecko
            const coins = await this.coingeckoService.getCoinsByCategory(categorySlug);

            if (!coins || coins.length === 0) {
                this.logger.warn(`No coins found for category ${categorySlug}`);
                return;
            }

            // Get Jupiter token list to verify Solana tokens
            let solanaTokenMap = new Map<string, any>();
            try {
                const jupiterTokens = await this.jupiterService.getTokenList();
                if (jupiterTokens.length > 0) {
                    solanaTokenMap = new Map(jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]));
                }
            } catch (error) {
                this.logger.warn("Jupiter API unavailable for category sync");
            }

            // Process and save tokens (only Solana)
            let syncedCount = 0;
            for (const coin of coins) {
                const jupiterToken = solanaTokenMap.get(coin.symbol.toLowerCase());

                // Skip if not a Solana token
                if (!jupiterToken) {
                    continue;
                }

                const tokenData = {
                    address: jupiterToken.address,
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
                    conflictPaths: ["address"],
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

        // Sync real-time data from external APIs before querying
        await this.syncTrendingTokens();

        // Determine which field to sort by based on time_frame
        let orderByField = "priceChange24h"; // default
        if (time_frame === GainersLosersTimeFrame.ONE_HOUR) {
            orderByField = "priceChange1h";
        } else if (time_frame === GainersLosersTimeFrame.SEVEN_DAYS) {
            orderByField = "priceChange7d";
        }

        let gainers: Token[] = [];
        let losers: Token[] = [];

        if (type === GainersLosersType.GAINERS || type === GainersLosersType.BOTH) {
            gainers = await this.tokenRepository.find({
                where: {},
                order: { [orderByField]: "DESC" },
                take: limit,
                relations: ["category"]
            });
        }

        if (type === GainersLosersType.LOSERS || type === GainersLosersType.BOTH) {
            losers = await this.tokenRepository.find({
                where: {},
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

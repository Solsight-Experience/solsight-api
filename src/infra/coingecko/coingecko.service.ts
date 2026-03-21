import { Injectable, Logger, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import axios, { AxiosInstance } from "axios";

const CG_TTL = 5 * 60 * 1000; // 5 minutes

export interface CoinGeckoMarketData {
    id: string;
    symbol: string;
    name: string;
    image: string;
    current_price: number;
    market_cap: number;
    market_cap_rank: number;
    fully_diluted_valuation: number;
    total_volume: number;
    high_24h: number;
    low_24h: number;
    price_change_24h: number;
    price_change_percentage_24h: number;
    price_change_percentage_1h_in_currency?: number;
    price_change_percentage_7d_in_currency?: number;
    market_cap_change_24h: number;
    market_cap_change_percentage_24h: number;
    circulating_supply: number;
    total_supply: number;
    max_supply: number;
    ath: number;
    ath_change_percentage: number;
    ath_date: string;
    atl: number;
    atl_change_percentage: number;
    atl_date: string;
    last_updated: string;
}

export interface CoinGeckoCategory {
    id: string;
    name: string;
    market_cap: number;
    market_cap_change_24h: number;
    content?: string;
    top_3_coins?: string[];
    volume_24h: number;
    updated_at: string;
}

export interface CoinGeckoTrending {
    coins: Array<{
        item: {
            id: string;
            coin_id: number;
            name: string;
            symbol: string;
            market_cap_rank: number;
            thumb: string;
            small: string;
            large: string;
            slug: string;
            price_btc: number;
            score: number;
        };
    }>;
}

@Injectable()
export class CoinGeckoService {
    private readonly logger = new Logger(CoinGeckoService.name);
    private readonly apiClient: AxiosInstance;
    private readonly cgRateLimitRpm = 8;
    private cgRequestTimestamps: number[] = [];

    constructor(
        private readonly configService: ConfigService,
        @Inject(CACHE_MANAGER) private cacheManager: Cache
    ) {
        const apiUrl = this.configService.get<string>("coingecko.apiUrl");
        const apiKey = this.configService.get<string>("coingecko.apiKey");

        this.apiClient = axios.create({
            baseURL: apiUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
                ...(apiKey && { "x-cg-pro-api-key": apiKey })
            }
        });

        this.logger.log(`CoinGecko API initialized: ${apiUrl}`);
    }

    private async cgGet<T>(url: string, params?: Record<string, any>): Promise<T> {
        const windowMs = 60_000;
        const now = Date.now();
        this.cgRequestTimestamps = this.cgRequestTimestamps.filter((ts) => now - ts < windowMs);
        if (this.cgRequestTimestamps.length >= this.cgRateLimitRpm) {
            const oldest = this.cgRequestTimestamps[0];
            const waitMs = windowMs - (now - oldest) + 50;
            await new Promise((resolve) => setTimeout(resolve, waitMs));
        }
        this.cgRequestTimestamps.push(Date.now());
        const response = await this.apiClient.get<T>(url, params ? { params } : undefined);
        return response.data;
    }

    /**
     * Get trending coins from CoinGecko
     */
    async getTrendingCoins(): Promise<CoinGeckoTrending | null> {
        const cacheKey = "cg-trending";
        const cached = await this.cacheManager.get<CoinGeckoTrending>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoTrending>("/search/trending");
            this.logger.log(`Fetched ${data.coins.length} trending coins from CoinGecko`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error("Failed to fetch trending coins from CoinGecko", error);
            return null;
        }
    }

    /**
     * Get market data for specific coins
     */
    async getCoinsMarketData(coinIds: string[], vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        const cacheKey = `cg-market-${vsCurrency}-${[...coinIds].sort().join(",")}`;
        const cached = await this.cacheManager.get<CoinGeckoMarketData[]>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoMarketData[]>("/coins/markets", {
                vs_currency: vsCurrency,
                ids: coinIds.join(","),
                order: "market_cap_desc",
                per_page: 250,
                page: 1,
                sparkline: false,
                price_change_percentage: "1h,24h,7d"
            });

            this.logger.log(`Fetched market data for ${data.length} coins from CoinGecko`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error("Failed to fetch market data from CoinGecko");
            return [];
        }
    }

    /**
     * Get categories from CoinGecko
     */
    async getCategories(): Promise<CoinGeckoCategory[]> {
        const cacheKey = "cg-categories";
        const cached = await this.cacheManager.get<CoinGeckoCategory[]>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoCategory[]>("/coins/categories");

            this.logger.log(`Fetched ${data.length} categories from CoinGecko`);
            await this.cacheManager.set(cacheKey, data, 10 * 60 * 1000);
            return data;
        } catch (error) {
            this.logger.error("Failed to fetch categories from CoinGecko", error);
            return [];
        }
    }

    /**
     * Get coins by category from CoinGecko
     */
    async getCoinsByCategory(categoryId: string, vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        const cacheKey = `cg-category-${vsCurrency}-${categoryId}`;
        const cached = await this.cacheManager.get<CoinGeckoMarketData[]>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoMarketData[]>("/coins/markets", {
                vs_currency: vsCurrency,
                category: categoryId,
                order: "market_cap_desc",
                per_page: 100,
                page: 1,
                sparkline: false,
                price_change_percentage: "1h,24h,7d"
            });

            this.logger.log(`Fetched ${data.length} coins for category ${categoryId} from CoinGecko`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error(`Failed to fetch coins for category ${categoryId} from CoinGecko`, error);
            return [];
        }
    }

    /**
     * Get recently added coins (new listings)
     */
    async getRecentlyAddedCoins(limit = 50, vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        const cacheKey = `cg-recent-${vsCurrency}-${limit}`;
        const cached = await this.cacheManager.get<CoinGeckoMarketData[]>(cacheKey);
        if (cached) return cached;
        try {
            const raw = await this.cgGet<CoinGeckoMarketData[]>("/coins/markets", {
                vs_currency: vsCurrency,
                order: "market_cap_desc",
                per_page: limit,
                page: 1,
                sparkline: false,
                price_change_percentage: "1h,24h,7d"
            });

            // Sort by last_updated to get most recent
            const sortedByRecent = raw.sort((a, b) => {
                return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
            });

            this.logger.log(`Fetched ${sortedByRecent.length} recently added coins from CoinGecko`);
            await this.cacheManager.set(cacheKey, sortedByRecent, CG_TTL);
            return sortedByRecent;
        } catch (error) {
            this.logger.error("Failed to fetch recently added coins from CoinGecko", error);
            return [];
        }
    }

    /**
     * Get top coins by market cap
     */
    async getTopCoins(limit = 100, vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        const cacheKey = `cg-top-${vsCurrency}-${limit}`;
        const cached = await this.cacheManager.get<CoinGeckoMarketData[]>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoMarketData[]>("/coins/markets", {
                vs_currency: vsCurrency,
                order: "market_cap_desc",
                per_page: limit,
                page: 1,
                sparkline: false,
                price_change_percentage: "24h"
            });

            this.logger.log(`Fetched top ${data.length} coins from CoinGecko`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error("Failed to fetch top coins from CoinGecko", error);
            return [];
        }
    }

    /**
     * Get coin details by ID
     */
    async getCoinDetails(coinId: string): Promise<any> {
        const cacheKey = `cg-coin-${coinId}`;
        const cached = await this.cacheManager.get<any>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<any>(`/coins/${coinId}`, {
                localization: false,
                tickers: false,
                market_data: true,
                community_data: false,
                developer_data: false
            });

            this.logger.log(`Fetched details for coin: ${coinId}`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error(`Failed to fetch coin details for ${coinId}`, error);
            return null;
        }
    }

    /**
     * Search coins by query
     */
    async searchCoins(query: string): Promise<any> {
        const cacheKey = `cg-search-${query.toLowerCase().trim()}`;
        const cached = await this.cacheManager.get<any>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<any>("/search", { query });

            this.logger.log(`Search results for "${query}": ${data.coins?.length || 0} coins`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error(`Failed to search coins for query: ${query}`, error);
            return { coins: [] };
        }
    }

    /**
     * Get price change data for multiple coins
     */
    async getPriceChangeData(coinIds: string[], vsCurrency = "usd", timeframe = "24h"): Promise<Map<string, number>> {
        try {
            const marketData = await this.getCoinsMarketData(coinIds, vsCurrency);
            const priceChangeMap = new Map<string, number>();

            marketData.forEach((coin) => {
                if (timeframe === "24h") {
                    priceChangeMap.set(coin.id, coin.price_change_percentage_24h || 0);
                }
            });

            return priceChangeMap;
        } catch (error) {
            this.logger.error("Failed to fetch price change data", error);
            return new Map();
        }
    }
}

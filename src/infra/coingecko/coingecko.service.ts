import { Injectable, Logger, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from "cache-manager";
import axios, { AxiosInstance } from "axios";
import {
    CoinGeckoMarketData,
    CoinGeckoCategory,
    CoinGeckoTrending,
    CoinGeckoSearchResult,
    CoinGeckoSimplePriceResponse,
    CoinGeckoMarketChartRangeResponse
} from "./types";
import { JsonValue } from "../../common/types";
import type { Cluster } from "../../common/cluster/cluster.types";

const CG_TTL = 5 * 60 * 1000; // 5 minutes

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
                ...(apiKey && { "x-cg-demo-api-key": apiKey })
            }
        });

        this.logger.log(`CoinGecko API initialized: ${apiUrl}`);
    }

    private async cgGet<T>(url: string, params?: Record<string, string | number | boolean>): Promise<T> {
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

    private assertMainnet(cluster: Cluster, operation: string): void {
        if (cluster !== "mainnet") {
            throw new ServiceUnavailableException(`CoinGecko ${operation} is unavailable on devnet.`);
        }
    }

    async clearCategoriesCache(cluster: Cluster): Promise<void> {
        this.assertMainnet(cluster, "category cache refresh");
        await this.cacheManager.del("cg-categories");
    }

    /**
     * Get trending coins from CoinGecko
     */
    async getTrendingCoins(cluster: Cluster): Promise<CoinGeckoTrending | null> {
        this.assertMainnet(cluster, "trending coins");
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
    async getCoinsMarketData(cluster: Cluster, coinIds: string[], vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        this.assertMainnet(cluster, "market data");
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
        } catch {
            this.logger.error("Failed to fetch market data from CoinGecko");
            return [];
        }
    }

    /**
     * Get categories from CoinGecko
     */
    async getCategories(cluster: Cluster): Promise<CoinGeckoCategory[]> {
        this.assertMainnet(cluster, "categories");
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
    async getCoinsByCategory(cluster: Cluster, categoryId: string, vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        this.assertMainnet(cluster, "category market data");
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
    async getRecentlyAddedCoins(cluster: Cluster, limit = 50, vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        this.assertMainnet(cluster, "recently added coins");
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
    async getTopCoins(cluster: Cluster, limit = 100, vsCurrency = "usd"): Promise<CoinGeckoMarketData[]> {
        this.assertMainnet(cluster, "top coins");
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
    async getCoinDetails(cluster: Cluster, coinId: string): Promise<JsonValue | null> {
        this.assertMainnet(cluster, "coin details");
        const cacheKey = `cg-coin-${coinId}`;
        const cached = await this.cacheManager.get<JsonValue>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<JsonValue>(`/coins/${coinId}`, {
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
     * @param query - Search query (coin name or symbol)
     * @returns Search results containing coins, exchanges, categories, and nfts
     */
    async searchCoins(cluster: Cluster, query: string): Promise<CoinGeckoSearchResult> {
        this.assertMainnet(cluster, "coin search");
        const cacheKey = `cg-search-${query.toLowerCase().trim()}`;
        const cached = await this.cacheManager.get<CoinGeckoSearchResult>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoSearchResult>("/search", { query });

            this.logger.log(`Search results for "${query}": ${data.coins?.length || 0} coins`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error(`Failed to search coins for query: ${query}`, error);
            return { coins: [], exchanges: [], icos: [], categories: [], nfts: [] };
        }
    }

    /**
     * Find CoinGecko ID by matching token symbol and name
     * @param symbol - Token symbol (e.g., "JUP")
     * @param name - Token name (e.g., "Jupiter")
     * @returns CoinGecko coin ID if found, null otherwise
     */
    async findCoinGeckoId(cluster: Cluster, symbol: string, name: string): Promise<string | null> {
        const searchResult = await this.searchCoins(cluster, symbol);
        if (!searchResult.coins || searchResult.coins.length === 0) {
            return null;
        }

        // Try exact match on symbol and name (case-insensitive)
        const exactMatch = searchResult.coins.find(
            (coin) => coin.symbol.toLowerCase() === symbol.toLowerCase() && coin.name.toLowerCase() === name.toLowerCase()
        );

        if (exactMatch) {
            return exactMatch.id;
        }

        // Fallback: match by symbol only and pick the highest ranked one
        const symbolMatch = searchResult.coins.find((coin) => coin.symbol.toLowerCase() === symbol.toLowerCase());

        return symbolMatch?.id ?? null;
    }

    /**
     * Get price change data for multiple coins
     */
    async getPriceChangeData(cluster: Cluster, coinIds: string[], vsCurrency = "usd", timeframe = "24h"): Promise<Map<string, number>> {
        this.assertMainnet(cluster, "price changes");
        try {
            const marketData = await this.getCoinsMarketData(cluster, coinIds, vsCurrency);
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

    /**
     * Get simple price for one or more coins by their CoinGecko IDs
     * @param ids - CoinGecko coin IDs
     * @param vsCurrency - Target currency (default: "usd")
     * @param options - Optional flags to include extra data
     */
    async getSimplePrice(
        cluster: Cluster,
        ids: string[],
        vsCurrency = "usd",
        options?: {
            includeMarketCap?: boolean;
            include24hrVol?: boolean;
            include24hrChange?: boolean;
            includeLastUpdatedAt?: boolean;
            precision?: string;
        }
    ): Promise<CoinGeckoSimplePriceResponse> {
        this.assertMainnet(cluster, "simple price");
        const sortedIds = [...ids].sort().join(",");
        const cacheKey = `cg-simple-price-${vsCurrency}-${sortedIds}`;
        const cached = await this.cacheManager.get<CoinGeckoSimplePriceResponse>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoSimplePriceResponse>("/simple/price", {
                ids: sortedIds,
                vs_currencies: vsCurrency,
                ...(options?.includeMarketCap && { include_market_cap: true }),
                ...(options?.include24hrVol && { include_24hr_vol: true }),
                ...(options?.include24hrChange && { include_24hr_change: true }),
                ...(options?.includeLastUpdatedAt && { include_last_updated_at: true }),
                ...(options?.precision && { precision: options.precision })
            });

            this.logger.log(`Fetched simple price for ${ids.length} coin(s) from CoinGecko`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error(`Failed to fetch simple price for [${ids.join(", ")}] from CoinGecko`, error);
            return {};
        }
    }

    /**
     * Get historical chart data of a coin within a time range
     * @param coinId - CoinGecko coin ID
     * @param vsCurrency - Target currency (default: "usd")
     * @param from - Start date in UNIX timestamp (seconds)
     * @param to - End date in UNIX timestamp (seconds)
     * @param precision - Decimal place for currency price value
     */
    async getMarketChartRange(
        cluster: Cluster,
        coinId: string,
        vsCurrency = "usd",
        from: number,
        to: number,
        precision?: string
    ): Promise<CoinGeckoMarketChartRangeResponse> {
        this.assertMainnet(cluster, "market chart");
        const cacheKey = `cg-chart-range-${coinId}-${vsCurrency}-${from}-${to}`;
        const cached = await this.cacheManager.get<CoinGeckoMarketChartRangeResponse>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<CoinGeckoMarketChartRangeResponse>(`/coins/${coinId}/market_chart/range`, {
                vs_currency: vsCurrency,
                from,
                to,
                ...(precision && { precision })
            });

            // Historical data fully in the past can be cached longer (24h), otherwise use default TTL
            const nowSec = Date.now() / 1000;
            const ttl = to < nowSec - 86400 ? 24 * 60 * 60 * 1000 : CG_TTL;

            this.logger.log(`Fetched market chart range for ${coinId} (${data.prices.length} price points)`);
            await this.cacheManager.set(cacheKey, data, ttl);
            return data;
        } catch (error) {
            this.logger.error(`Failed to fetch market chart range for ${coinId}`, error);
            return { prices: [], market_caps: [], total_volumes: [] };
        }
    }

    /**
     * Get OHLC chart data of a coin
     * @param coinId - CoinGecko coin ID
     * @param vsCurrency - Target currency (default: "usd")
     * @param days - Data up to number of days ago (1, 7, 14, 30, 90, 180, 365)
     * @param precision - Decimal place for currency price value
     * @returns Array of [timestamp, open, high, low, close] tuples
     */
    async getOhlc(cluster: Cluster, coinId: string, vsCurrency = "usd", days: number, precision?: string): Promise<number[][]> {
        this.assertMainnet(cluster, "OHLC data");
        const cacheKey = `cg-ohlc-${coinId}-${vsCurrency}-${days}`;
        const cached = await this.cacheManager.get<number[][]>(cacheKey);
        if (cached) return cached;
        try {
            const data = await this.cgGet<number[][]>(`/coins/${coinId}/ohlc`, {
                vs_currency: vsCurrency,
                days: String(days),
                ...(precision && { precision })
            });

            this.logger.log(`Fetched OHLC for ${coinId} (${data.length} candles, ${days}d)`);
            await this.cacheManager.set(cacheKey, data, CG_TTL);
            return data;
        } catch (error) {
            this.logger.error(`Failed to fetch OHLC for ${coinId}`, error);
            return [];
        }
    }
}

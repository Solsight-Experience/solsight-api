import { Injectable, Logger, NotFoundException, HttpException, HttpStatus } from "@nestjs/common";
import { TokensService } from "./tokens.service";
import { PromptBuilderService, SummaryOptions } from "./prompt-builder.service";
import { GeminiService } from "../../../infra/gemini/gemini.service";
import { RedisService } from "../../../redis/services/redis.service";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Token } from "../entities/token.entity";

export interface GenerateSummaryOptions extends SummaryOptions {
    forceRefresh?: boolean;
}

export interface TokenSummaryResult {
    address: string;
    summary: string;
    generatedAt: Date;
    model: string;
    cached: boolean;
    tokenData?: {
        name: string;
        symbol: string;
        price: number;
        priceChange24h: number;
    };
}

@Injectable()
export class TokenSummaryService {
    private readonly logger = new Logger(TokenSummaryService.name);
    private readonly CACHE_KEY_PREFIX = "token:summary";
    private readonly DEFAULT_CACHE_TTL = 600; // 10 minutes default
    private readonly ACTIVE_TOKEN_TTL = 300; // 5 minutes for active tokens
    private readonly INACTIVE_TOKEN_TTL = 900; // 15 minutes for less active tokens

    constructor(
        private readonly tokensService: TokensService,
        private readonly promptBuilderService: PromptBuilderService,
        private readonly geminiService: GeminiService,
        private readonly redisService: RedisService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    /**
     * Generate AI-powered summary for a token
     * @param address - Token address
     * @param options - Summarization options
     * @returns Token summary result
     */
    async generateSummary(address: string, options: GenerateSummaryOptions = {}): Promise<TokenSummaryResult> {
        const { forceRefresh = false, ...summaryOptions } = options;

        // Check if Gemini is configured
        if (!this.geminiService.isConfigured()) {
            throw new HttpException("AI service is not configured. Please set GEMINI_API_KEY in environment variables.", HttpStatus.SERVICE_UNAVAILABLE);
        }

        // Check cache first (if not forcing refresh)
        if (!forceRefresh) {
            const cached = await this.getCachedSummary(address);
            if (cached) {
                this.logger.log(`Returning cached summary for token: ${address}`);
                return cached;
            }
        }

        // Fetch token data
        const tokenResponse = await this.tokensService.findOne(address);
        if (!tokenResponse) {
            throw new NotFoundException(`Token with address ${address} not found`);
        }

        // Fetch full token entity for complete data
        const token = await this.tokenRepository.findOne({
            where: { address },
            relations: ["category"]
        });

        if (!token) {
            throw new NotFoundException(`Token entity not found for address ${address}`);
        }

        // Fetch category tokens for comparison if requested
        let categoryTokens: Token[] | undefined;
        if (summaryOptions.includeMarketComparison !== false && token.categoryId) {
            categoryTokens = await this.tokenRepository.find({
                where: { categoryId: token.categoryId },
                take: 20, // Limit to top 20 tokens in category
                order: { marketCap: "DESC" }
            });
        }

        // Build prompt
        const prompt = this.promptBuilderService.buildSummaryPrompt(token, categoryTokens, summaryOptions);

        // Generate summary using Gemini
        let summary: string;
        let model: string;

        try {
            this.logger.log(`Generating AI summary for token: ${token.symbol} (${address})`);
            const startTime = Date.now();

            const geminiResponse = await this.geminiService.generateText({
                prompt,
                temperature: 0.5,
                maxOutputTokens: 800
            });

            summary = geminiResponse.text;
            model = geminiResponse.model;

            const duration = Date.now() - startTime;
            this.logger.log(`AI summary generated in ${duration}ms. Tokens: ${geminiResponse.totalTokenCount || "N/A"}`);
        } catch (error) {
            this.logger.error("Error generating AI summary", error);
            throw new HttpException("Failed to generate AI summary. Please try again later.", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Prepare result
        const result: TokenSummaryResult = {
            address: token.address,
            summary,
            generatedAt: new Date(),
            model,
            cached: false,
            tokenData: {
                name: token.name,
                symbol: token.symbol,
                price: Number(token.price),
                priceChange24h: Number(token.priceChange24h)
            }
        };

        // Cache the result
        await this.cacheSummary(token, result);

        return result;
    }

    /**
     * Get cached summary if available
     */
    private async getCachedSummary(address: string): Promise<TokenSummaryResult | null> {
        try {
            const cacheKey = this.getCacheKey(address);
            const cached = await this.redisService.get<TokenSummaryResult>(cacheKey);

            if (cached) {
                return {
                    ...cached,
                    cached: true,
                    generatedAt: new Date(cached.generatedAt) // Parse date
                };
            }

            return null;
        } catch (error) {
            this.logger.error("Error getting cached summary", error);
            return null;
        }
    }

    /**
     * Cache summary with dynamic TTL based on token activity
     */
    private async cacheSummary(token: Token, result: TokenSummaryResult): Promise<void> {
        try {
            const cacheKey = this.getCacheKey(token.address);
            const ttl = this.calculateCacheTTL(token);

            await this.redisService.set(cacheKey, result, ttl);
            this.logger.debug(`Cached summary for ${token.symbol} with TTL: ${ttl} seconds`);
        } catch (error) {
            this.logger.error("Error caching summary", error);
            // Don't throw - caching failure shouldn't block the response
        }
    }

    /**
     * Calculate cache TTL based on token activity level
     * More active tokens get shorter cache time for fresher data
     */
    private calculateCacheTTL(token: Token): number {
        const txns24h = token.txns24hTotal || 0;
        const volume24h = Number(token.volume24h) || 0;

        // High activity: > 1000 transactions or > $100k volume
        if (txns24h > 1000 || volume24h > 100000) {
            return this.ACTIVE_TOKEN_TTL; // 5 minutes
        }

        // Medium to low activity
        if (txns24h > 100 || volume24h > 10000) {
            return this.DEFAULT_CACHE_TTL; // 10 minutes
        }

        // Very low activity
        return this.INACTIVE_TOKEN_TTL; // 15 minutes
    }

    /**
     * Get cache key for a token summary
     */
    private getCacheKey(address: string): string {
        return `${this.CACHE_KEY_PREFIX}:${address}`;
    }

    /**
     * Invalidate cached summary for a token
     */
    async invalidateCache(address: string): Promise<void> {
        try {
            const cacheKey = this.getCacheKey(address);
            const redis = this.redisService.getClient();

            if (redis) {
                await redis.del(cacheKey);
                this.logger.log(`Invalidated cache for token: ${address}`);
            }
        } catch (error) {
            this.logger.error("Error invalidating cache", error);
        }
    }

    /**
     * Get summary statistics (for monitoring/debugging)
     */
    async getSummaryStats(): Promise<{
        totalCached: number;
        cacheKeys: string[];
    }> {
        try {
            const redis = this.redisService.getClient();

            if (!redis) {
                return { totalCached: 0, cacheKeys: [] };
            }

            const pattern = `${this.CACHE_KEY_PREFIX}:*`;
            const keys = await redis.keys(pattern);

            return {
                totalCached: keys.length,
                cacheKeys: keys
            };
        } catch (error) {
            this.logger.error("Error getting summary stats", error);
            return { totalCached: 0, cacheKeys: [] };
        }
    }
}

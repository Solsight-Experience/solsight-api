import { Injectable, Logger, HttpException, HttpStatus } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { TokensService } from "./tokens.service";
import { PromptBuilderService, TokenContext } from "./prompt-builder.service";
import { GeminiService } from "../../../infra/gemini/gemini.service";
import { RedisService } from "../../../redis/services/redis.service";
import { Token } from "../entities/token.entity";
import { ClusterProvider } from "../../../common/cluster/cluster.provider";

export interface TokenSummaryInput {
    address: string;
    name: string;
    symbol: string;
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
        price?: number;
        priceChange24h?: number;
    };
}

@Injectable()
export class TokenSummaryService {
    private readonly logger = new Logger(TokenSummaryService.name);
    private readonly CACHE_KEY_PREFIX = "token:summary";
    private readonly DEFAULT_CACHE_TTL = 600;
    private readonly ACTIVE_TOKEN_TTL = 300;
    private readonly INACTIVE_TOKEN_TTL = 900;

    constructor(
        private readonly promptBuilderService: PromptBuilderService,
        private readonly geminiService: GeminiService,
        private readonly redisService: RedisService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly clusterProvider: ClusterProvider
    ) {}

    async generateSummary(input: TokenSummaryInput): Promise<TokenSummaryResult> {
        const { address, name, symbol } = input;

        if (!this.geminiService.isConfigured()) {
            throw new HttpException("AI service is not configured. Please set OPENAI_API_KEY in environment variables.", HttpStatus.SERVICE_UNAVAILABLE);
        }

        const cached = await this.getCachedSummary(address);
        if (cached) {
            this.logger.log(`Returning cached summary for token: ${address}`);
            return cached;
        }

        let token: Token | null = null;
        try {
            token = await this.tokenRepository.findOne({
                where: { address, network: this.clusterProvider.cluster },
                relations: ["category"]
            });
        } catch {
            this.logger.warn(`Could not find token entity for ${address}, falling back to basic input.`);
        }

        const context: TokenContext = {
            name: token?.name || name,
            symbol: token?.symbol || symbol,
            description: token?.description,
            category: token?.category?.name,
            website: token?.website
        };

        const prompt = this.promptBuilderService.buildSummaryPrompt(context);

        let summary: string;
        let model: string;

        try {
            this.logger.log(`Generating AI summary for token: ${context.symbol} (${address})`);
            const startTime = Date.now();

            const geminiResponse = await this.geminiService.generateText({
                prompt,
                temperature: 0.7,
                maxOutputTokens: 200
            });

            summary = geminiResponse.text;
            model = geminiResponse.model;

            const duration = Date.now() - startTime;
            this.logger.log(`AI summary generated in ${duration}ms. Tokens: ${geminiResponse.totalTokenCount || "N/A"}`);
        } catch (error) {
            this.logger.error("Error generating AI summary", error);
            throw new HttpException("Failed to generate AI summary. Please try again later.", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        const result: TokenSummaryResult = {
            address,
            summary,
            generatedAt: new Date(),
            model,
            cached: false,
            tokenData: {
                name: context.name,
                symbol: context.symbol,
                price: token ? Number(token.price) : undefined,
                priceChange24h: token ? Number(token.priceChange24h) : undefined
            }
        };

        await this.cacheSummary(address, token, result);

        return result;
    }

    private async getCachedSummary(address: string): Promise<TokenSummaryResult | null> {
        try {
            const cacheKey = this.getCacheKey(address);
            const cached = await this.redisService.get<TokenSummaryResult>(cacheKey);

            if (cached) {
                return {
                    ...cached,
                    cached: true,
                    generatedAt: new Date(cached.generatedAt)
                };
            }
            return null;
        } catch (error) {
            this.logger.error("Error getting cached summary", error);
            return null;
        }
    }

    private async cacheSummary(address: string, token: Token | null, result: TokenSummaryResult): Promise<void> {
        try {
            const cacheKey = this.getCacheKey(address);
            const ttl = token ? this.calculateCacheTTL(token) : this.DEFAULT_CACHE_TTL;

            await this.redisService.set(cacheKey, result, ttl);
            this.logger.debug(`Cached summary for ${address} with TTL: ${ttl} seconds`);
        } catch (error) {
            this.logger.error("Error caching summary", error);
        }
    }

    private calculateCacheTTL(token: Token): number {
        const txns24h = token.txns24hTotal || 0;
        const volume24h = Number(token.volume24h) || 0;

        if (txns24h > 1000 || volume24h > 100000) {
            return this.ACTIVE_TOKEN_TTL;
        }
        if (txns24h > 100 || volume24h > 10000) {
            return this.DEFAULT_CACHE_TTL;
        }
        return this.INACTIVE_TOKEN_TTL;
    }

    private getCacheKey(address: string): string {
        return `${this.CACHE_KEY_PREFIX}:${this.clusterProvider.cluster}:${address}`;
    }
}

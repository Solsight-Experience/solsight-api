import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Token } from "../entities/token.entity";
import { In, Repository } from "typeorm";
import { CoinGeckoService } from "src/infra/coingecko/coingecko.service";
import type { Cluster } from "src/common/cluster/cluster.types";
import { RedisService } from "src/redis";
import { FRESH_MIN_TTL_S, TokenPriceResult } from "../types/token-price.types";
import { getErrorMessage, logError } from "src/common/errors/error-helper";

@Injectable()
export class TokenPriceService {
    private readonly logger = new Logger(TokenPriceService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly redisService: RedisService,
        private readonly coinGeckoService: CoinGeckoService
    ) {}

    async getPrice(cluster: Cluster, mint: string): Promise<TokenPriceResult> {
        const key = RedisService.KEYS.TOKEN_PRICE_LATEST(cluster, mint);
        try {
            const cached = await this.redisService.hgetall(key);
            if (cached?.price_usd) {
                const priceUsd = parseFloat(cached.price_usd);
                if (Number.isFinite(priceUsd) && priceUsd > 0) {
                    const ttl = await this.redisService.ttl(key);
                    if (!(ttl > 0 && ttl < FRESH_MIN_TTL_S)) {
                        return { priceUsd, priceChange24h: 0, source: "redis" };
                    }
                    this.logger.debug(`Redis price stale for ${mint} (ttl=${ttl}s), fetching fresh price`);
                }
            }
        } catch (error) {
            this.logger.debug(`Redis price lookup failed for ${mint}: ${getErrorMessage(error)}`);
        }

        const token = await this.tokenRepository.findOne({
            where: { address: mint, network: cluster },
            select: ["price", "priceChange24h", "coingeckoId"]
        });

        const dbPrice = Number(token?.price) || 0;
        if (dbPrice > 0) {
            return { priceUsd: dbPrice, priceChange24h: Number(token?.priceChange24h) || 0, source: "db" };
        }

        if (token?.coingeckoId && cluster === "mainnet") {
            try {
                const prices = await this.coinGeckoService.getSimplePrice(cluster, [token.coingeckoId]);
                const priceUsd = prices[token.coingeckoId]?.usd || 0;
                if (priceUsd > 0) {
                    return { priceUsd, priceChange24h: 0, source: "coingecko" };
                }
            } catch (error) {
                logError(this.logger, `Failed to fetch price from CoinGecko for mint ${mint}`, error);
            }
        }

        return { priceUsd: 0, priceChange24h: 0, source: "db" };
    }

    async getPrices(cluster: Cluster, mints: string[]): Promise<Map<string, TokenPriceResult>> {
        const result = new Map<string, TokenPriceResult>();
        if (mints.length === 0) return result;

        const needFallback: string[] = [];

        await Promise.all(
            mints.map(async (mint) => {
                try {
                    const key = RedisService.KEYS.TOKEN_PRICE_LATEST(cluster, mint);
                    const cached = await this.redisService.hgetall(key);
                    if (cached?.price_usd) {
                        const priceUsd = parseFloat(cached.price_usd);
                        if (Number.isFinite(priceUsd) && priceUsd > 0) {
                            result.set(mint, { priceUsd, priceChange24h: 0, source: "redis" });
                            return;
                        }
                    }
                } catch (error) {
                    this.logger.debug(`Redis price lookup failed for ${mint}: ${getErrorMessage(error)}`);
                }
                needFallback.push(mint);
            })
        );

        if (needFallback.length > 0) {
            const tokens = await this.tokenRepository.find({
                where: { address: In(needFallback), network: cluster },
                select: ["address", "price", "priceChange24h", "coingeckoId"]
            });

            const cgIdToMint = new Map<string, string>();
            const cgIds: string[] = [];

            for (const t of tokens) {
                const priceUsd = Number(t.price) || 0;
                if (priceUsd > 0) {
                    result.set(t.address, { priceUsd, priceChange24h: Number(t.priceChange24h) || 0, source: "db" });
                } else if (t.coingeckoId && cluster === "mainnet") {
                    cgIds.push(t.coingeckoId);
                    cgIdToMint.set(t.coingeckoId, t.address);
                }
            }

            if (cgIds.length > 0) {
                try {
                    const prices = await this.coinGeckoService.getSimplePrice(cluster, cgIds);
                    for (const cgId of cgIds) {
                        const priceUsd = (prices as Record<string, { usd?: number }>)[cgId]?.usd ?? 0;
                        const mint = cgIdToMint.get(cgId);
                        if (mint && priceUsd > 0) {
                            result.set(mint, { priceUsd, priceChange24h: 0, source: "coingecko" });
                        }
                    }
                } catch (error) {
                    logError(this.logger, `Failed to fetch prices from CoinGecko for mints: ${needFallback.join(", ")}`, error);
                }
            }
        }

        for (const mint of mints) {
            if (!result.has(mint)) {
                result.set(mint, { priceUsd: 0, priceChange24h: 0, source: "db" });
            }
        }

        return result;
    }

    async getPriceHistory(cluster: Cluster, mint: string, fromSec: number, toSec: number): Promise<Map<number, number>> {
        // 86400 = seconds / day
        const fromDay = Math.floor(fromSec / 86400) * 86400;
        const toDay = Math.ceil(toSec / 86400) * 86400;

        if (cluster !== "mainnet") {
            this.logger.warn(`Price history requested for non-mainnet mint ${mint} on ${cluster}, returning empty history`);
            return new Map();
        }

        const token = await this.tokenRepository.findOne({
            where: { address: mint, network: cluster },
            select: ["coingeckoId"]
        });

        if (!token?.coingeckoId) return new Map();

        try {
            const data = await this.coinGeckoService.getMarketChartRange(cluster, token.coingeckoId, "usd", fromDay, toDay);
            const priceChart = new Map<number, number>();
            for (const [tsMs, price] of data.prices) {
                const dayTs = Math.floor(tsMs / 1000 / 86400) * 86400;
                priceChart.set(dayTs, price);
            }
            return priceChart;
        } catch (error) {
            logError(this.logger, `Failed to fetch price history from CoinGecko for mint ${mint}`, error);
            return new Map();
        }
    }
}

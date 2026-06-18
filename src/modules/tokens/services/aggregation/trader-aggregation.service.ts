import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RedisService } from "../../../../redis/services/redis.service";
import { SwapEvent, TopTrader } from "../../types/swap-event.types";
import { TraderPosition } from "../../entities/trader-position.entity";

const TRADER_TTL = 24 * 60 * 60; // 24 hours

@Injectable()
export class TraderAggregationService {
    private readonly logger = new Logger(TraderAggregationService.name);

    constructor(
        private readonly redisService: RedisService,
        @InjectRepository(TraderPosition)
        private readonly traderPositionRepo: Repository<TraderPosition>
    ) {}

    async onSwapEvent(swap: SwapEvent): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) {
            this.logger.warn("Redis unavailable, skipping trader aggregation");
            return;
        }

        try {
            const tokenMint = this.getTokenMint(swap);
            const traderAddress = swap.maker;
            const isBuy = swap.direction === "BUY";
            const tokenAmount = isBuy ? swap.token_out.amount_ui : swap.token_in.amount_ui;

            const resolvedPrice = await this.resolvePrice(swap, tokenMint);
            const volumeUsd = tokenAmount * resolvedPrice;

            const traderKey = `trader:${tokenMint}:${traderAddress}`;
            const rankingKey = `traders:${tokenMint}:by_volume`;

            // Load current state — fall back to DB if Redis has expired
            let data = await redis.hgetall(traderKey);
            if (!data || Object.keys(data).length === 0) {
                data = await this.loadStateFromDb(traderAddress, tokenMint);
            }

            let totalBought = parseFloat(data.total_bought || "0");
            let totalSold = parseFloat(data.total_sold || "0");
            let tokensHeld = parseFloat(data.total_tokens_held || "0");
            let costBasisUsd = parseFloat(data.total_cost_usd || "0");
            let pnl = parseFloat(data.pnl || "0");
            let winTrades = parseInt(data.win_trades || "0", 10);
            let totalSellTrades = parseInt(data.total_sell_trades || "0", 10);
            let tradesCount = parseInt(data.trades_count || "0", 10);

            if (isBuy) {
                totalBought += volumeUsd;
                tokensHeld += tokenAmount;
                costBasisUsd += volumeUsd;
            } else {
                totalSold += volumeUsd;
                if (tokensHeld > 0) {
                    const avgCostPerToken = costBasisUsd / tokensHeld;
                    const costOfSold = tokenAmount * avgCostPerToken;
                    const tradePnl = volumeUsd - costOfSold;
                    pnl += tradePnl;
                    tokensHeld = Math.max(0, tokensHeld - tokenAmount);
                    costBasisUsd = Math.max(0, costBasisUsd - costOfSold);
                    if (tradePnl > 0) winTrades++;
                    totalSellTrades++;
                }
            }
            tradesCount++;

            const totalVolume = totalBought + totalSold;

            // Write to Redis
            const pipeline = redis.pipeline();
            pipeline.hset(traderKey, {
                total_bought: totalBought,
                total_sold: totalSold,
                total_tokens_held: tokensHeld,
                total_cost_usd: costBasisUsd,
                pnl,
                win_trades: winTrades,
                total_sell_trades: totalSellTrades,
                trades_count: tradesCount
            });
            pipeline.expire(traderKey, TRADER_TTL);
            pipeline.zadd(rankingKey, totalVolume, traderAddress);
            pipeline.expire(rankingKey, TRADER_TTL);
            await pipeline.exec();

            // Persist to DB
            await this.traderPositionRepo.upsert(
                {
                    walletAddress: traderAddress,
                    tokenMint,
                    totalBoughtUsd: totalBought,
                    totalSoldUsd: totalSold,
                    tokensHeld,
                    costBasisUsd,
                    realizedPnl: pnl,
                    winTrades,
                    totalSellTrades,
                    tradesCount,
                    totalVolume
                },
                ["walletAddress", "tokenMint"]
            );
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Error in trader onSwapEvent: ${err.message}`, err.stack);
        }
    }

    async getTopTraders(tokenMint: string, limit = 10): Promise<TopTrader[]> {
        const redis = this.redisService.getClient();
        if (!redis) return this.getTopTradersFromDb(tokenMint, limit);

        try {
            const rankingKey = `traders:${tokenMint}:by_volume`;
            const topAddresses = await redis.zrevrange(rankingKey, 0, limit - 1);

            if (topAddresses.length === 0) {
                return this.getTopTradersFromDb(tokenMint, limit);
            }

            const priceData = await redis.hgetall(`price:${tokenMint}:latest`);
            const currentPrice = priceData?.price_usd ? parseFloat(priceData.price_usd) : 0;

            const traders: TopTrader[] = [];

            for (const address of topAddresses) {
                const traderKey = `trader:${tokenMint}:${address}`;
                const data = await redis.hgetall(traderKey);

                if (data && Object.keys(data).length > 0) {
                    traders.push(this.mapToTopTrader(address, data, currentPrice));
                }
            }

            return traders;
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Redis error in getTopTraders for "${tokenMint}": ${err.message}`, err.stack);
            return [];
        }
    }

    async getTrader(tokenMint: string, address: string): Promise<TopTrader | null> {
        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const traderKey = `trader:${tokenMint}:${address}`;
            const data = await redis.hgetall(traderKey);

            if (data && Object.keys(data).length > 0) {
                const priceData = await redis.hgetall(`price:${tokenMint}:latest`);
                const currentPrice = priceData?.price_usd ? parseFloat(priceData.price_usd) : 0;
                return this.mapToTopTrader(address, data, currentPrice);
            }

            // Redis miss — try DB
            const position = await this.traderPositionRepo.findOne({ where: { walletAddress: address, tokenMint } });
            if (!position) return null;

            const realizedPnl = parseFloat(String(position.realizedPnl));
            const tokensHeld = parseFloat(String(position.tokensHeld));
            const costBasisUsd = parseFloat(String(position.costBasisUsd));
            const totalBought = parseFloat(String(position.totalBoughtUsd));
            // DB fallback: no live price available, unrealized PnL is 0
            return {
                address,
                name: null,
                total_pnl: realizedPnl,
                realized_pnl: realizedPnl,
                unrealized_pnl: 0,
                roi_percent: totalBought > 0 ? (realizedPnl / totalBought) * 100 : 0,
                total_bought: totalBought,
                total_sold: parseFloat(String(position.totalSoldUsd)),
                tokens_held: tokensHeld,
                win_rate: position.totalSellTrades > 0 ? (position.winTrades / position.totalSellTrades) * 100 : 0,
                trades_count: position.tradesCount
            };
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`Error in getTrader for "${tokenMint}" address "${address}": ${err.message}`, err.stack);
            return null;
        }
    }

    private async getTopTradersFromDb(tokenMint: string, limit: number): Promise<TopTrader[]> {
        try {
            const positions = await this.traderPositionRepo.find({
                where: { tokenMint },
                order: { totalVolume: "DESC" },
                take: limit
            });

            return positions.map((p) => {
                const realizedPnl = parseFloat(String(p.realizedPnl));
                const totalBought = parseFloat(String(p.totalBoughtUsd));
                return {
                    address: p.walletAddress,
                    name: null,
                    total_pnl: realizedPnl,
                    realized_pnl: realizedPnl,
                    unrealized_pnl: 0,
                    roi_percent: totalBought > 0 ? (realizedPnl / totalBought) * 100 : 0,
                    total_bought: totalBought,
                    total_sold: parseFloat(String(p.totalSoldUsd)),
                    tokens_held: parseFloat(String(p.tokensHeld)),
                    win_rate: p.totalSellTrades > 0 ? (p.winTrades / p.totalSellTrades) * 100 : 0,
                    trades_count: p.tradesCount
                };
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            this.logger.error(`DB error in getTopTradersFromDb for "${tokenMint}": ${err.message}`, err.stack);
            return [];
        }
    }

    private async loadStateFromDb(walletAddress: string, tokenMint: string): Promise<Record<string, string>> {
        try {
            const position = await this.traderPositionRepo.findOne({ where: { walletAddress, tokenMint } });
            if (!position) return {};
            return {
                total_bought: String(position.totalBoughtUsd),
                total_sold: String(position.totalSoldUsd),
                total_tokens_held: String(position.tokensHeld),
                total_cost_usd: String(position.costBasisUsd),
                pnl: String(position.realizedPnl),
                win_trades: String(position.winTrades),
                total_sell_trades: String(position.totalSellTrades),
                trades_count: String(position.tradesCount)
            };
        } catch {
            return {};
        }
    }

    private async resolvePrice(swap: SwapEvent, tokenMint: string): Promise<number> {
        if (swap.price_usd != null && swap.price_usd > 0) return swap.price_usd;
        const priceData = await this.redisService.hgetall(`price:${tokenMint}:latest`);
        if (priceData?.price_usd) {
            const cached = parseFloat(priceData.price_usd);
            if (cached > 0) return cached;
        }
        return swap.price_native;
    }

    private mapToTopTrader(address: string, data: Record<string, string>, currentPrice = 0): TopTrader {
        const totalBought = parseFloat(data.total_bought || "0");
        const tokensHeld = parseFloat(data.total_tokens_held || "0");
        const costBasisUsd = parseFloat(data.total_cost_usd || "0");
        const realizedPnl = parseFloat(data.pnl || "0");
        const unrealizedPnl = tokensHeld > 0 && currentPrice > 0 ? tokensHeld * currentPrice - costBasisUsd : 0;
        const totalPnl = realizedPnl + unrealizedPnl;
        const winTrades = parseInt(data.win_trades || "0", 10);
        const totalSellTrades = parseInt(data.total_sell_trades || "0", 10);
        return {
            address,
            name: null,
            total_pnl: totalPnl,
            realized_pnl: realizedPnl,
            unrealized_pnl: unrealizedPnl,
            roi_percent: totalBought > 0 ? (totalPnl / totalBought) * 100 : 0,
            total_bought: totalBought,
            total_sold: parseFloat(data.total_sold || "0"),
            tokens_held: tokensHeld,
            win_rate: totalSellTrades > 0 ? (winTrades / totalSellTrades) * 100 : 0,
            trades_count: parseInt(data.trades_count || "0", 10)
        };
    }

    private getTokenMint(swap: SwapEvent): string {
        if (!swap.token_in.is_quote) {
            return swap.token_in.mint;
        }
        return swap.token_out.mint;
    }
}

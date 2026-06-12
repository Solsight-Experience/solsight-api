import { Injectable, Logger } from "@nestjs/common";
import { RedisService } from "../../../../redis/services/redis.service";
import { SwapEvent, TopTrader } from "../../types/swap-event.types";

const TRADER_TTL = 24 * 60 * 60; // 24 hours

@Injectable()
export class TraderAggregationService {
    private readonly logger = new Logger(TraderAggregationService.name);

    constructor(private readonly redisService: RedisService) {}

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
            const price = swap.price_usd ?? swap.price_native;
            const volumeUsd = tokenAmount * price;

            const traderKey = `trader:${tokenMint}:${traderAddress}`;
            const rankingKey = `traders:${tokenMint}:by_volume`;

            // Update trader stats
            if (isBuy) {
                await redis.hincrbyfloat(traderKey, "total_bought", volumeUsd);
                await redis.hincrbyfloat(traderKey, "total_tokens_held", tokenAmount);
                await redis.hincrbyfloat(traderKey, "total_cost_usd", volumeUsd);
            } else {
                await redis.hincrbyfloat(traderKey, "total_sold", volumeUsd);

                const tokensHeld = parseFloat((await redis.hget(traderKey, "total_tokens_held")) || "0");
                const costUsd = parseFloat((await redis.hget(traderKey, "total_cost_usd")) || "0");

                if (tokensHeld > 0) {
                    const avgCostPerToken = costUsd / tokensHeld;
                    const costBasis = tokenAmount * avgCostPerToken;
                    const tradePnl = volumeUsd - costBasis;

                    await redis.hincrbyfloat(traderKey, "pnl", tradePnl);
                    await redis.hset(traderKey, "total_tokens_held", Math.max(0, tokensHeld - tokenAmount));
                    await redis.hset(traderKey, "total_cost_usd", Math.max(0, costUsd - costBasis));

                    if (tradePnl > 0) {
                        await redis.hincrby(traderKey, "win_trades", 1);
                    }
                }
                await redis.hincrby(traderKey, "total_sell_trades", 1);
            }

            await redis.hincrby(traderKey, "trades_count", 1);
            await redis.expire(traderKey, TRADER_TTL);

            // Update ranking by total volume
            const bought = parseFloat((await redis.hget(traderKey, "total_bought")) || "0");
            const sold = parseFloat((await redis.hget(traderKey, "total_sold")) || "0");
            const totalVolume = bought + sold;

            await redis.zadd(rankingKey, totalVolume, traderAddress);
            await redis.expire(rankingKey, TRADER_TTL);
        } catch (error) {
            this.logger.error("Redis error in trader onSwapEvent:", error);
        }
    }

    async getTopTraders(tokenMint: string, limit = 10): Promise<TopTrader[]> {
        const redis = this.redisService.getClient();
        if (!redis) return [];

        try {
            const rankingKey = `traders:${tokenMint}:by_volume`;

            // Get top traders by volume (descending order)
            const topAddresses = await redis.zrevrange(rankingKey, 0, limit - 1);

            const traders: TopTrader[] = [];

            for (const address of topAddresses) {
                const traderKey = `trader:${tokenMint}:${address}`;
                const data = await redis.hgetall(traderKey);

                if (data && Object.keys(data).length > 0) {
                    const totalBought = parseFloat(data.total_bought || "0");
                    const pnl = parseFloat(data.pnl || "0");
                    const winTrades = parseInt(data.win_trades || "0", 10);
                    const totalSellTrades = parseInt(data.total_sell_trades || "0", 10);

                    traders.push({
                        address,
                        name: null,
                        total_pnl: pnl,
                        roi_percent: totalBought > 0 ? (pnl / totalBought) * 100 : 0,
                        total_bought: totalBought,
                        total_sold: parseFloat(data.total_sold || "0"),
                        win_rate: totalSellTrades > 0 ? (winTrades / totalSellTrades) * 100 : 0,
                        trades_count: parseInt(data.trades_count || "0", 10)
                    });
                }
            }

            return traders;
        } catch (error) {
            this.logger.error(`Redis error in getTopTraders for "${tokenMint}":`, error);
            return [];
        }
    }

    async getTrader(tokenMint: string, address: string): Promise<TopTrader | null> {
        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const traderKey = `trader:${tokenMint}:${address}`;
            const data = await redis.hgetall(traderKey);

            if (!data || Object.keys(data).length === 0) {
                return null;
            }

            const totalBought = parseFloat(data.total_bought || "0");
            const pnl = parseFloat(data.pnl || "0");
            const winTrades = parseInt(data.win_trades || "0", 10);
            const totalSellTrades = parseInt(data.total_sell_trades || "0", 10);

            return {
                address,
                name: null,
                total_pnl: pnl,
                roi_percent: totalBought > 0 ? (pnl / totalBought) * 100 : 0,
                total_bought: totalBought,
                total_sold: parseFloat(data.total_sold || "0"),
                win_rate: totalSellTrades > 0 ? (winTrades / totalSellTrades) * 100 : 0,
                trades_count: parseInt(data.trades_count || "0", 10)
            };
        } catch (error) {
            this.logger.error(`Redis error in getTrader for "${tokenMint}" address "${address}":`, error);
            return null;
        }
    }

    private getTokenMint(swap: SwapEvent): string {
        if (!swap.token_in.is_quote) {
            return swap.token_in.mint;
        }
        return swap.token_out.mint;
    }
}

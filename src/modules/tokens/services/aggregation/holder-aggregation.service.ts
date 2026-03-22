import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RedisService } from "../../../../redis/services/redis.service";
import { PubSubService } from "../../../../redis/services/pubsub.service";
import { SwapEvent, HolderData } from "../../types/swap-event.type";
import { getWalletLabel } from "../../data/wallet-labels";

const HOLDER_TTL = 24 * 60 * 60; // 24 hours
const PRICE_TTL = 60 * 60; // 1 hour

interface HolderUpdateEvent {
    mint: string;
    wallet: string;
    balance: number;
    balance_change: number;
    last_active_slot: number;
    last_active_ts: number;
    slot: number;
    signature: string;
    is_new_holder: boolean;
    is_removed: boolean;
    rank: number | null;
    rank_change: number | null;
}

interface PriceUpdateEvent {
    mint: string;
    price_usd: number;
    price_native: number;
    slot: number;
    source: string;
}

export interface EnrichedHolder extends HolderData {
    last_active_ts: number;
    avg_buy_price: number;
    avg_sell_price: number;
    cost_basis: number;
    unrealized_pnl: number;
    realized_pnl: number;
    remaining_usd: number;
    funding_label: string | null;
    account_type: string | null;
    buy_tx_count: number;
    sell_tx_count: number;
}

@Injectable()
export class HolderAggregationService implements OnModuleInit {
    private readonly logger = new Logger(HolderAggregationService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly pubSubService: PubSubService
    ) {}

    async onModuleInit(): Promise<void> {
        await this.pubSubService.subscribe("solsight:holder_updates", async (message) => {
            try {
                await this.onHolderUpdate(message as HolderUpdateEvent);
            } catch (error) {
                this.logger.error("Error processing holder update:", error);
            }
        });

        await this.pubSubService.subscribe("solsight:price_updates", async (message) => {
            try {
                await this.onPriceUpdate(message as PriceUpdateEvent);
            } catch (error) {
                this.logger.error("Error processing price update:", error);
            }
        });
    }

    async onHolderUpdate(event: HolderUpdateEvent): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        const holderKey = `holder:${event.mint}:${event.wallet}`;
        const rankingKey = `holders:${event.mint}:ranked`;

        try {
            if (event.is_removed) {
                await redis.zrem(rankingKey, event.wallet);
                await redis.del(holderKey);
                return;
            }

            await redis.hset(holderKey, {
                balance: event.balance,
                last_active_ts: event.last_active_ts,
                last_active_slot: event.last_active_slot
            });
            await redis.expire(holderKey, HOLDER_TTL);

            if (event.balance > 0) {
                await redis.zadd(rankingKey, event.balance, event.wallet);
            } else {
                await redis.zrem(rankingKey, event.wallet);
            }
            await redis.expire(rankingKey, HOLDER_TTL);
        } catch (error) {
            this.logger.error(`Redis error in onHolderUpdate for "${event.mint}":`, error);
        }
    }

    async onPriceUpdate(event: PriceUpdateEvent): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        const priceKey = `price:${event.mint}:latest`;

        try {
            await redis.hset(priceKey, {
                price_usd: event.price_usd,
                price_native: event.price_native,
                slot: event.slot,
                source: event.source
            });
            await redis.expire(priceKey, PRICE_TTL);

            // Recalculate unrealized PnL for top 50 holders
            const rankingKey = `holders:${event.mint}:ranked`;
            const topAddresses = await redis.zrevrange(rankingKey, 0, 49);

            await Promise.all(
                topAddresses.map(async (address) => {
                    const holderKey = `holder:${event.mint}:${address}`;
                    const data = await redis.hgetall(holderKey);
                    if (!data || !data.balance || !data.cost_basis) return;

                    const balance = parseFloat(data.balance);
                    const costBasis = parseFloat(data.cost_basis);
                    const unrealizedPnl = balance * event.price_usd - costBasis;
                    await redis.hset(holderKey, "unrealized_pnl", unrealizedPnl);
                })
            );
        } catch (error) {
            this.logger.error(`Redis error in onPriceUpdate for "${event.mint}":`, error);
        }
    }

    async onSwapEvent(swap: SwapEvent): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) {
            this.logger.warn("Redis unavailable, skipping holder aggregation");
            return;
        }

        try {
            const tokenMint = this.getTokenMint(swap);
            const holderAddress = swap.maker;
            const isBuy = swap.direction === "BUY";

            const tokenAmount = isBuy ? swap.token_out.amount_ui : swap.token_in.amount_ui;
            const price = swap.price_usd ?? swap.price_native;
            const volumeUsd = tokenAmount * price;

            const holderKey = `holder:${tokenMint}:${holderAddress}`;
            const rankingKey = `holders:${tokenMint}:ranked`;
            const now = Date.now();

            if (isBuy) {
                await redis.hincrbyfloat(holderKey, "balance", tokenAmount);
                await redis.hincrbyfloat(holderKey, "total_bought", volumeUsd);
                await redis.hincrbyfloat(holderKey, "cost_basis", volumeUsd);
                await redis.hincrby(holderKey, "buy_tx_count", 1);
            } else {
                await redis.hincrbyfloat(holderKey, "balance", -tokenAmount);
                await redis.hincrbyfloat(holderKey, "total_sold", volumeUsd);
                await redis.hincrby(holderKey, "sell_tx_count", 1);

                // Track realized PnL on sell: reduce cost_basis proportionally
                const balanceRaw = await redis.hget(holderKey, "balance");
                const costBasisRaw = await redis.hget(holderKey, "cost_basis");
                const prevBalance = parseFloat(balanceRaw || "0") + tokenAmount;
                if (prevBalance > 0) {
                    const costPerToken = parseFloat(costBasisRaw || "0") / prevBalance;
                    const costOfSold = costPerToken * tokenAmount;
                    const realizedPnl = volumeUsd - costOfSold;
                    await redis.hincrbyfloat(holderKey, "realized_pnl", realizedPnl);
                    await redis.hincrbyfloat(holderKey, "cost_basis", -costOfSold);
                }
            }

            await redis.hincrby(holderKey, "tx_count", 1);

            const firstTx = await redis.hget(holderKey, "first_tx_time");
            if (!firstTx) {
                await redis.hset(holderKey, "first_tx_time", now);
            }

            await redis.hset(holderKey, "last_tx_time", now);
            await redis.expire(holderKey, HOLDER_TTL);

            const balance = parseFloat((await redis.hget(holderKey, "balance")) || "0");
            if (balance > 0) {
                await redis.zadd(rankingKey, balance, holderAddress);
            } else {
                await redis.zrem(rankingKey, holderAddress);
            }
            await redis.expire(rankingKey, HOLDER_TTL);
        } catch (error) {
            this.logger.error("Redis error in holder onSwapEvent:", error);
        }
    }

    async getTopHolders(tokenMint: string, limit = 20): Promise<EnrichedHolder[]> {
        const redis = this.redisService.getClient();
        if (!redis) return [];

        try {
            const rankingKey = `holders:${tokenMint}:ranked`;
            const topAddresses = await redis.zrevrange(rankingKey, 0, limit - 1);

            const priceKey = `price:${tokenMint}:latest`;
            const priceData = await redis.hgetall(priceKey);
            const currentPriceUsd = priceData ? parseFloat(priceData.price_usd || "0") : 0;

            // Fetch total supply for balance_percent calculation
            const supplyKey = `supply:${tokenMint}`;
            const totalSupplyStr = await redis.get(supplyKey);
            const totalSupply = totalSupplyStr ? parseFloat(totalSupplyStr) : 0;

            const holders: EnrichedHolder[] = [];

            for (const address of topAddresses) {
                const holderKey = `holder:${tokenMint}:${address}`;
                const data = await redis.hgetall(holderKey);

                if (!data || Object.keys(data).length === 0) continue;

                const balance = parseFloat(data.balance || "0");
                const totalBought = parseFloat(data.total_bought || "0");
                const totalSold = parseFloat(data.total_sold || "0");
                const costBasis = parseFloat(data.cost_basis || "0");
                const realizedPnl = parseFloat(data.realized_pnl || "0");
                const txCount = parseInt(data.tx_count || "0", 10);
                const buyTxCount = parseInt(data.buy_tx_count || "0", 10);
                const sellTxCount = parseInt(data.sell_tx_count || "0", 10);
                const firstTxTime = parseInt(data.first_tx_time || "0", 10);
                const lastTxTime = parseInt(data.last_tx_time || "0", 10);
                const lastActiveTs = parseInt(data.last_active_ts || data.last_tx_time || "0", 10);

                const unrealizedPnl = parseFloat(data.unrealized_pnl || "0") || (currentPriceUsd > 0 ? balance * currentPriceUsd - costBasis : 0);

                const totalPnl = realizedPnl + unrealizedPnl;
                const roiPercent = totalBought > 0 ? (totalPnl / totalBought) * 100 : 0;
                const avgBuyPrice = buyTxCount > 0 && balance > 0 ? costBasis / balance : 0;
                const avgSellPrice = sellTxCount > 0 && totalSold > 0 ? totalSold / sellTxCount : 0;
                const remainingUsd = balance * currentPriceUsd;

                const walletLabel = getWalletLabel(address);

                // Calculate balance_percent from total supply
                const balancePercent = totalSupply > 0 ? (balance / totalSupply) * 100 : 0;

                holders.push({
                    address,
                    name: walletLabel?.name ?? null,
                    balance,
                    balance_percent: balancePercent,
                    avg_buy_price: avgBuyPrice,
                    avg_sell_price: avgSellPrice,
                    total_bought: totalBought,
                    total_sold: totalSold,
                    realized_pnl: realizedPnl,
                    unrealized_pnl: unrealizedPnl,
                    total_pnl: totalPnl,
                    roi_percent: roiPercent,
                    first_tx_time: firstTxTime,
                    last_tx_time: lastTxTime,
                    last_active_ts: lastActiveTs,
                    cost_basis: costBasis,
                    remaining_usd: remainingUsd,
                    funding_label: walletLabel?.name ?? null,
                    account_type: walletLabel?.type ?? null,
                    tx_count: txCount,
                    buy_tx_count: buyTxCount,
                    sell_tx_count: sellTxCount
                });
            }

            return holders;
        } catch (error) {
            this.logger.error(`Redis error in getTopHolders for "${tokenMint}":`, error);
            return [];
        }
    }

    async getHolder(tokenMint: string, address: string): Promise<HolderData | null> {
        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const holderKey = `holder:${tokenMint}:${address}`;
            const data = await redis.hgetall(holderKey);

            if (!data || Object.keys(data).length === 0) return null;

            const balance = parseFloat(data.balance || "0");
            const costBasis = parseFloat(data.cost_basis || "0");
            const realizedPnl = parseFloat(data.realized_pnl || "0");

            // Fetch total supply for balance_percent calculation
            const supplyKey = `supply:${tokenMint}`;
            const totalSupplyStr = await redis.get(supplyKey);
            const totalSupply = totalSupplyStr ? parseFloat(totalSupplyStr) : 0;
            const balancePercent = totalSupply > 0 ? (balance / totalSupply) * 100 : 0;

            return {
                address,
                name: null,
                balance,
                balance_percent: balancePercent,
                avg_buy_price: balance > 0 ? costBasis / balance : 0,
                total_bought: parseFloat(data.total_bought || "0"),
                total_sold: parseFloat(data.total_sold || "0"),
                realized_pnl: realizedPnl,
                unrealized_pnl: parseFloat(data.unrealized_pnl || "0"),
                total_pnl: realizedPnl + parseFloat(data.unrealized_pnl || "0"),
                roi_percent: 0,
                first_tx_time: parseInt(data.first_tx_time || "0", 10),
                last_tx_time: parseInt(data.last_tx_time || "0", 10),
                tx_count: parseInt(data.tx_count || "0", 10)
            };
        } catch (error) {
            this.logger.error(`Redis error in getHolder for "${tokenMint}" address "${address}":`, error);
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

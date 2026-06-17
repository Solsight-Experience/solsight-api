import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RedisService } from "../../../../redis/services/redis.service";
import { PubSubService } from "../../../../redis/services/pubsub.service";
import { HolderData, SwapEvent } from "../../types/swap-event.types";
import { getWalletLabel } from "../../data/wallet-labels";
import { JupiterService } from "../../../../infra/jupiter/jupiter.service";
import { EnrichedHolder, HolderUpdateEvent, PriceUpdateEvent } from "../../types/holder-aggregation.types";

const HOLDER_TTL = 24 * 60 * 60; // 24 hours
const PRICE_TTL = 60 * 60; // 1 hour

@Injectable()
export class HolderAggregationService implements OnModuleInit {
    private readonly logger = new Logger(HolderAggregationService.name);

    constructor(
        private readonly redisService: RedisService,
        private readonly pubSubService: PubSubService,
        private readonly jupiterService: JupiterService
    ) {}

    async onModuleInit(): Promise<void> {
        await this.pubSubService.subscribe<HolderUpdateEvent>("solsight:holder_updates", (message) => {
            void this.onHolderUpdate(message).catch((error) => {
                this.logger.error("Error processing holder update:", error);
            });
        });

        await this.pubSubService.subscribe<PriceUpdateEvent>("solsight:price_updates", (message) => {
            void this.onPriceUpdate(message).catch((error) => {
                this.logger.error("Error processing price update:", error);
            });
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

            // Update balance and activity fields
            const updateData: Record<string, string | number> = {
                balance: event.balance,
                last_active_ts: event.last_active_ts,
                last_active_slot: event.last_active_slot
            };

            // Include trade-related fields if present (from indexer HolderUpdateEvent)
            if (event.total_bought_raw !== undefined) {
                updateData.total_bought_raw = event.total_bought_raw;
            }
            if (event.total_sold_raw !== undefined) {
                updateData.total_sold_raw = event.total_sold_raw;
            }
            if (event.total_bought_usd !== undefined) {
                updateData.total_bought = event.total_bought_usd;
            }
            if (event.total_sold_usd !== undefined) {
                updateData.total_sold = event.total_sold_usd;
            }
            if (event.buy_tx_count !== undefined) {
                updateData.buy_tx_count = event.buy_tx_count;
            }
            if (event.sell_tx_count !== undefined) {
                updateData.sell_tx_count = event.sell_tx_count;
            }

            // Compute cost_basis and realized_pnl from indexer aggregate data (average cost method)
            if (event.total_bought_raw > 0) {
                const avgBuyPrice = event.total_bought_usd / event.total_bought_raw;
                updateData.cost_basis = event.balance * avgBuyPrice;
                const soldRaw = event.total_bought_raw - event.balance;
                if (soldRaw > 0) {
                    updateData.realized_pnl = event.total_sold_usd - soldRaw * avgBuyPrice;
                }
            }

            await redis.hset(holderKey, updateData);
            await redis.expire(holderKey, HOLDER_TTL);

            if (event.balance > 0) {
                await redis.zadd(rankingKey, event.balance, event.wallet);
            } else {
                await redis.zrem(rankingKey, event.wallet);
            }
            await redis.expire(rankingKey, HOLDER_TTL);
        } catch (error) {
            this.logger.error(`Redis error in onHolderUpdate for "${event.mint}": ${error?.message}`, error?.stack);
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
            this.logger.log(`Updated price for token: ${event.mint}, price=${event.price_usd}`);
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
            this.logger.error(`Redis error in onPriceUpdate for "${event.mint}": ${error?.message}`, error?.stack);
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
            const resolvedPrice = await this.resolvePrice(swap, tokenMint);
            const volumeUsd = tokenAmount * resolvedPrice;

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
            this.logger.error(`Redis error in holder onSwapEvent: ${error?.message}`, error?.stack);
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
            let currentPriceUsd = priceData ? parseFloat(priceData.price_usd || "0") : 0;

            // Fetch total supply for balance_percent calculation
            const supplyKey = `supply:${tokenMint}`;
            const totalSupplyStr = await redis.get(supplyKey);
            let totalSupply = totalSupplyStr ? parseFloat(totalSupplyStr) : 0;

            // Fallback to Jupiter if price or supply not found in Redis
            if (currentPriceUsd === 0 || totalSupply === 0) {
                this.logger.debug(`Price or supply not found in Redis for ${tokenMint}, fetching from Jupiter`);
                const tokenInfo = await this.jupiterService.searchToken(tokenMint);
                if (tokenInfo) {
                    if (currentPriceUsd === 0 && tokenInfo.usdPrice) {
                        currentPriceUsd = tokenInfo.usdPrice;
                        this.logger.log(`Fetched price from Jupiter for ${tokenMint}: $${currentPriceUsd}`);
                    }
                    if (totalSupply === 0 && tokenInfo.totalSupply) {
                        totalSupply = tokenInfo.totalSupply;
                        this.logger.log(`Fetched total supply from Jupiter for ${tokenMint}: ${totalSupply}`);
                    }
                }
            }

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
            this.logger.error(`Redis error in getTopHolders for "${tokenMint}": ${error?.message}`, error?.stack);
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
            this.logger.error(`Redis error in getHolder for "${tokenMint}" address "${address}": ${error?.message}`, error?.stack);
            return null;
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

    private getTokenMint(swap: SwapEvent): string {
        if (!swap.token_in.is_quote) {
            return swap.token_in.mint;
        }
        return swap.token_out.mint;
    }
}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RedisService } from "../../../../redis/services/redis.service";
import { HolderData, SwapEvent } from "../../types/swap-event.types";
import { getWalletLabel } from "../../data/wallet-labels";
import { EnrichedHolder, HolderUpdateEvent, PriceUpdateEvent, HolderUpsertRow, HolderEnrichmentInput } from "../../types/holder-aggregation.types";
import { Holder } from "../../entities/holder.entity";
import { Token } from "../../entities/token.entity";
import { logError } from "src/common/errors/error-helper";
import { TokenPriceService } from "../token-price.service";
import type { Cluster } from "src/common/cluster/cluster.types";

const HOLDER_UPSERT_FLUSH_MS = 5_000;

@Injectable()
export class HolderAggregationService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(HolderAggregationService.name);
    private readonly holderUpsertBuffer = new Map<string, HolderUpsertRow>();
    private flushTimer?: ReturnType<typeof setInterval>;

    constructor(
        private readonly redisService: RedisService,
        private readonly tokenPriceService: TokenPriceService,
        @InjectRepository(Holder)
        private readonly holderRepository: Repository<Holder>,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {}

    onModuleInit(): void {
        this.flushTimer = setInterval(() => {
            void this.flushHolderUpserts().catch((error) => {
                logError(this.logger, "Failed to flush holder upsert buffer", error);
            });
        }, HOLDER_UPSERT_FLUSH_MS);
    }

    async onModuleDestroy(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.flushHolderUpserts();
    }

    async onHolderUpdate(event: HolderUpdateEvent): Promise<void> {
        const redis = this.redisService.getClient();
        const network = event.network;
        const holderKey = RedisService.KEYS.HOLDER_MINT_WALLET(network, event.mint, event.wallet);
        const rankingKey = RedisService.KEYS.HOLDER_RANKING(network, event.mint);

        if (event.is_removed) {
            if (redis) {
                try {
                    await redis.zrem(rankingKey, event.wallet);
                    await redis.del(holderKey);
                } catch (error) {
                    logError(this.logger, `Redis error removing holder "${event.wallet}" for "${event.mint}"`, error);
                }
            }

            this.holderUpsertBuffer.delete(this.holderBufferKey(network, event.mint, event.wallet));
            await this.deleteHolderState(event, network);
            return;
        }

        try {
            if (!redis) {
                this.queueHolderUpsert(event, network);
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
            await redis.expire(holderKey, RedisService.TTL.HOLDER_MINT_WALLET);

            if (event.balance > 0) {
                await redis.zadd(rankingKey, event.balance, event.wallet);
            } else {
                await redis.zrem(rankingKey, event.wallet);
            }
            await redis.expire(rankingKey, RedisService.TTL.HOLDER_RANKING);
        } catch (error) {
            logError(this.logger, `Redis error in onHolderUpdate for "${event.mint}"`, error);
        }

        this.queueHolderUpsert(event, network);
    }

    async onPriceUpdate(event: PriceUpdateEvent): Promise<void> {
        const network = event.network;

        const stored = await this.tokenPriceService.setPrice({
            cluster: network,
            mint: event.mint,
            priceUsd: event.price_usd,
            priceNative: event.price_native,
            slot: event.slot,
            source: "indexer-price-update"
        });
        if (!stored) return;

        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            const committedPrice = await this.tokenPriceService.getPrice(network, event.mint);
            if (committedPrice.priceUsd <= 0) return;

            this.logger.log(`Updated price for token: ${event.mint}, price=${committedPrice.priceUsd}`);

            // Recalculate unrealized PnL for top 50 holders
            const rankingKey = RedisService.KEYS.HOLDER_RANKING(network, event.mint);
            const topAddresses = await redis.zrevrange(rankingKey, 0, 49);

            await Promise.all(
                topAddresses.map(async (address) => {
                    const holderKey = RedisService.KEYS.HOLDER_MINT_WALLET(network, event.mint, address);
                    const data = await redis.hgetall(holderKey);
                    if (!data || !data.balance || !data.cost_basis) return;

                    const balance = parseFloat(data.balance);
                    const costBasis = parseFloat(data.cost_basis);
                    const unrealizedPnl = balance * committedPrice.priceUsd - costBasis;
                    await redis.hset(holderKey, "unrealized_pnl", unrealizedPnl);
                })
            );
        } catch (error) {
            logError(this.logger, `Redis error in onPriceUpdate for "${event.mint}":`, error);
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
            const network = swap.network;
            const holderAddress = swap.maker;
            const isBuy = swap.direction === "BUY";

            const tokenAmount = isBuy ? swap.token_out.amount_ui : swap.token_in.amount_ui;
            const resolvedPrice = await this.resolvePrice(swap, tokenMint);
            const volumeUsd = tokenAmount * resolvedPrice;

            const holderKey = RedisService.KEYS.HOLDER_MINT_WALLET(network, tokenMint, holderAddress);
            const rankingKey = RedisService.KEYS.HOLDER_RANKING(network, tokenMint);
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
            await redis.expire(holderKey, RedisService.TTL.HOLDER_MINT_WALLET);

            const balance = parseFloat((await redis.hget(holderKey, "balance")) || "0");
            if (balance > 0) {
                await redis.zadd(rankingKey, balance, holderAddress);
            } else {
                await redis.zrem(rankingKey, holderAddress);
            }
            await redis.expire(rankingKey, RedisService.TTL.HOLDER_RANKING);
        } catch (error) {
            logError(this.logger, "Redis error in holder onSwapEvent", error);
        }
    }

    async getTopHolders(cluster: Cluster, tokenMint: string, limit = 20): Promise<EnrichedHolder[]> {
        const redis = this.redisService.getClient();
        if (!redis) return [];

        try {
            const rankingKey = RedisService.KEYS.HOLDER_RANKING(cluster, tokenMint);
            const topAddresses = await redis.zrevrange(rankingKey, 0, limit - 1);
            const holderRows: HolderEnrichmentInput[] = [];

            for (const address of topAddresses) {
                const holderKey = RedisService.KEYS.HOLDER_MINT_WALLET(cluster, tokenMint, address);
                const data = await redis.hgetall(holderKey);

                if (!data || Object.keys(data).length === 0) continue;

                holderRows.push({
                    wallet: address,
                    balance: data.balance || "0",
                    totalBoughtUsd: data.total_bought || "0",
                    totalSoldUsd: data.total_sold || "0",
                    buyTxCount: data.buy_tx_count || "0",
                    sellTxCount: data.sell_tx_count || "0",
                    lastActiveTs: data.last_active_ts || data.last_tx_time || "0",
                    redisData: data
                });
            }

            return this.enrichHolders(tokenMint, cluster, holderRows);
        } catch (error) {
            logError(this.logger, `Redis error in getTopHolders for "${tokenMint}"`, error);
            return [];
        }
    }

    async enrichHolders(tokenMint: string, cluster: Cluster, rows: HolderEnrichmentInput[]): Promise<EnrichedHolder[]> {
        const redis = this.redisService.getClient();
        const { currentPriceUsd, totalSupply } = await this.getPriceAndSupply(tokenMint, cluster);
        const holders: EnrichedHolder[] = [];

        for (const row of rows) {
            const address = row.wallet;
            const redisData =
                row.redisData ??
                (redis
                    ? await redis.hgetall(RedisService.KEYS.HOLDER_MINT_WALLET(cluster, tokenMint, address)).catch(() => ({}) as Record<string, string>)
                    : ({} as Record<string, string>));
            const data = redisData && Object.keys(redisData).length > 0 ? redisData : {};

            const balance = this.toNumber(data.balance ?? row.balance);
            const totalBought = this.toNumber(data.total_bought ?? row.totalBoughtUsd);
            const totalSold = this.toNumber(data.total_sold ?? row.totalSoldUsd);
            const costBasis = this.toNumber(data.cost_basis);
            const realizedPnl = this.toNumber(data.realized_pnl);
            const buyTxCount = this.toInt(data.buy_tx_count ?? row.buyTxCount);
            const sellTxCount = this.toInt(data.sell_tx_count ?? row.sellTxCount);
            const txCount = this.toInt(data.tx_count) || buyTxCount + sellTxCount;
            const firstTxTime = this.toInt(data.first_tx_time);
            const lastTxTime = this.toInt(data.last_tx_time);
            const lastActiveTs = this.toInt(data.last_active_ts ?? row.lastActiveTs ?? data.last_tx_time);
            const unrealizedPnl = this.toNumber(data.unrealized_pnl) || (currentPriceUsd > 0 ? balance * currentPriceUsd - costBasis : 0);

            const totalPnl = realizedPnl + unrealizedPnl;
            const roiPercent = totalBought > 0 ? (totalPnl / totalBought) * 100 : 0;
            const avgBuyPrice = buyTxCount > 0 && balance > 0 ? costBasis / balance : 0;
            const avgSellPrice = sellTxCount > 0 && totalSold > 0 ? totalSold / sellTxCount : 0;
            const remainingUsd = balance * currentPriceUsd;
            const walletLabel = getWalletLabel(address);
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
    }

    async getHolder(cluster: Cluster, tokenMint: string, address: string): Promise<HolderData | null> {
        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const holderKey = RedisService.KEYS.HOLDER_MINT_WALLET(cluster, tokenMint, address);
            const data = await redis.hgetall(holderKey);

            if (!data || Object.keys(data).length === 0) return null;

            const balance = parseFloat(data.balance || "0");
            const costBasis = parseFloat(data.cost_basis || "0");
            const realizedPnl = parseFloat(data.realized_pnl || "0");

            // Fetch total supply for balance_percent calculation
            const totalSupplyStr = await redis.get(RedisService.KEYS.SUPPLY(cluster, tokenMint));
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
            logError(this.logger, `Redis error in getHolder for "${tokenMint}" address "${address}"`, error);
            return null;
        }
    }

    private async resolvePrice(swap: SwapEvent, tokenMint: string): Promise<number> {
        if (swap.price_usd != null && swap.price_usd > 0) return swap.price_usd;
        const priceData = await this.tokenPriceService.getPrice(swap.network, tokenMint);
        if (priceData.priceUsd > 0) return priceData.priceUsd;
        return swap.price_native;
    }

    private getTokenMint(swap: SwapEvent): string {
        if (!swap.token_in.is_quote) {
            return swap.token_in.mint;
        }
        return swap.token_out.mint;
    }

    private queueHolderUpsert(event: HolderUpdateEvent, network: Cluster): void {
        this.holderUpsertBuffer.set(this.holderBufferKey(network, event.mint, event.wallet), {
            tokenMint: event.mint,
            network,
            wallet: event.wallet,
            balance: this.toDecimalString(event.balance),
            lastActiveSlot: event.last_active_slot,
            lastActiveTs: event.last_active_ts,
            totalBoughtRaw: this.toDecimalString(event.total_bought_raw ?? 0),
            totalSoldRaw: this.toDecimalString(event.total_sold_raw ?? 0),
            totalBoughtUsd: this.toNumber(event.total_bought_usd),
            totalSoldUsd: this.toNumber(event.total_sold_usd),
            buyTxCount: this.toInt(event.buy_tx_count),
            sellTxCount: this.toInt(event.sell_tx_count),
            updatedAt: Date.now()
        });
    }

    private async flushHolderUpserts(): Promise<void> {
        if (this.holderUpsertBuffer.size === 0) return;

        const rows = Array.from(this.holderUpsertBuffer.values());
        this.holderUpsertBuffer.clear();

        try {
            await this.holderRepository.upsert(rows, ["tokenMint", "network", "wallet"]);
        } catch (error) {
            for (const row of rows) {
                this.holderUpsertBuffer.set(this.holderBufferKey(row.network, row.tokenMint, row.wallet), row);
            }
            logError(this.logger, `Failed to upsert ${rows.length} holder rows`, error);
        }
    }

    private async deleteHolderState(event: HolderUpdateEvent, network: Cluster): Promise<void> {
        try {
            await this.holderRepository.delete({ tokenMint: event.mint, network, wallet: event.wallet });
        } catch (error) {
            logError(this.logger, `Failed to delete holder ${network}:${event.mint}:${event.wallet}`, error);
        }
    }

    private async getPriceAndSupply(tokenMint: string, cluster: Cluster): Promise<{ currentPriceUsd: number; totalSupply: number }> {
        const redis = this.redisService.getClient();
        const [priceData, totalSupplyStr] = redis
            ? await Promise.all([this.tokenPriceService.getPrice(cluster, tokenMint), redis.get(RedisService.KEYS.SUPPLY(cluster, tokenMint))])
            : [null, null];
        let currentPriceUsd = priceData ? this.toNumber(priceData.priceUsd) : 0;
        let totalSupply = totalSupplyStr ? this.toNumber(totalSupplyStr) : 0;

        if (currentPriceUsd === 0 || totalSupply === 0) {
            const token = await this.tokenRepository.findOne({
                where: { address: tokenMint, network: cluster },
                select: ["price", "totalSupply"]
            });
            if (token) {
                if (currentPriceUsd === 0 && token.price) {
                    currentPriceUsd = Number(token.price);
                }
                if (totalSupply === 0 && token.totalSupply) {
                    totalSupply = Number(token.totalSupply);
                }
            }
        }

        return { currentPriceUsd, totalSupply };
    }

    private holderBufferKey(cluster: string, mint: string, wallet: string): string {
        return `${cluster}:${mint}:${wallet}`;
    }

    private toDecimalString(value: unknown): string {
        if (value == null || value === "") return "0";
        if (typeof value === "string" || typeof value === "number") return String(value);
        return "0";
    }

    private toNumber(value: unknown): number {
        const num = Number(value ?? 0);
        return Number.isFinite(num) ? num : 0;
    }

    private toInt(value: unknown): number {
        const str = typeof value === "string" || typeof value === "number" ? String(value) : "0";
        const num = parseInt(str ?? "0", 10);
        return Number.isFinite(num) ? num : 0;
    }
}

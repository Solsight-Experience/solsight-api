import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RedisService } from "../../../../redis/services/redis.service";
import { PubSubService } from "../../../../redis/services/pubsub.service";
import { HolderData, SwapEvent } from "../../types/swap-event.types";
import { getWalletLabel } from "../../data/wallet-labels";
import { JupiterService } from "../../../../infra/jupiter/jupiter.service";
import { EnrichedHolder, HolderUpdateEvent, PriceUpdateEvent } from "../../types/holder-aggregation.types";
import { ClusterProvider } from "../../../../common/cluster/cluster.provider";
import { Holder } from "../../entities/holder.entity";

const HOLDER_TTL = 24 * 60 * 60; // 24 hours
const PRICE_TTL = 60 * 60; // 1 hour
const HOLDER_UPSERT_FLUSH_MS = 5_000;

type HolderUpsertRow = Pick<
    Holder,
    | "tokenMint"
    | "network"
    | "wallet"
    | "balance"
    | "lastActiveSlot"
    | "lastActiveTs"
    | "totalBoughtRaw"
    | "totalSoldRaw"
    | "totalBoughtUsd"
    | "totalSoldUsd"
    | "buyTxCount"
    | "sellTxCount"
    | "updatedAt"
>;

type HolderEnrichmentInput = {
    wallet: string;
    balance: string | number;
    lastActiveTs?: string | number;
    totalBoughtUsd?: string | number;
    totalSoldUsd?: string | number;
    buyTxCount?: string | number;
    sellTxCount?: string | number;
    redisData?: Record<string, string>;
};

@Injectable()
export class HolderAggregationService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(HolderAggregationService.name);
    private readonly holderUpsertBuffer = new Map<string, HolderUpsertRow>();
    private flushTimer?: ReturnType<typeof setInterval>;

    constructor(
        private readonly redisService: RedisService,
        private readonly pubSubService: PubSubService,
        private readonly jupiterService: JupiterService,
        private readonly clusterProvider: ClusterProvider,
        @InjectRepository(Holder)
        private readonly holderRepository: Repository<Holder>
    ) {}

    async onModuleInit(): Promise<void> {
        this.flushTimer = setInterval(() => {
            void this.flushHolderUpserts().catch((error) => {
                this.logger.error("Failed to flush holder upsert buffer:", error);
            });
        }, HOLDER_UPSERT_FLUSH_MS);

        for (const network of ["mainnet", "devnet"]) {
            await this.pubSubService.subscribe<HolderUpdateEvent>(`solsight:holder_updates:${network}`, (message) => {
                void this.onHolderUpdate({ ...message, network: message.network || network }).catch((error) => {
                    this.logger.error("Error processing holder update:", error);
                });
            });

            await this.pubSubService.subscribe<PriceUpdateEvent>(`solsight:price_updates:${network}`, (message) => {
                void this.onPriceUpdate({ ...message, network: message.network || network }).catch((error) => {
                    this.logger.error("Error processing price update:", error);
                });
            });
        }
    }

    async onModuleDestroy(): Promise<void> {
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        await this.flushHolderUpserts();
    }

    async onHolderUpdate(event: HolderUpdateEvent): Promise<void> {
        const redis = this.redisService.getClient();
        const network = event.network || "mainnet";
        const holderKey = `holder:${network}:${event.mint}:${event.wallet}`;
        const rankingKey = `holders:${network}:${event.mint}:ranked`;

        if (event.is_removed) {
            if (redis) {
                try {
                    await redis.zrem(rankingKey, event.wallet);
                    await redis.del(holderKey);
                } catch (error) {
                    this.logger.error(`Redis error removing holder "${event.wallet}" for "${event.mint}":`, error);
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

            await redis.hset(holderKey, updateData);
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

        this.queueHolderUpsert(event, network);
    }

    async onPriceUpdate(event: PriceUpdateEvent): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        const network = event.network || "mainnet";
        const priceKey = `price:${network}:${event.mint}:latest`;

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
            const rankingKey = `holders:${network}:${event.mint}:ranked`;
            const topAddresses = await redis.zrevrange(rankingKey, 0, 49);

            await Promise.all(
                topAddresses.map(async (address) => {
                    const holderKey = `holder:${network}:${event.mint}:${address}`;
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
            const network = swap.network || "mainnet";
            const holderAddress = swap.maker;
            const isBuy = swap.direction === "BUY";

            const tokenAmount = isBuy ? swap.token_out.amount_ui : swap.token_in.amount_ui;
            const price = swap.price_usd ?? swap.price_native;
            const volumeUsd = tokenAmount * price;

            const holderKey = `holder:${network}:${tokenMint}:${holderAddress}`;
            const rankingKey = `holders:${network}:${tokenMint}:ranked`;
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
            const network = this.clusterProvider.cluster;
            const rankingKey = `holders:${network}:${tokenMint}:ranked`;
            const topAddresses = await redis.zrevrange(rankingKey, 0, limit - 1);
            const holderRows: HolderEnrichmentInput[] = [];

            for (const address of topAddresses) {
                const holderKey = `holder:${network}:${tokenMint}:${address}`;
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

            return this.enrichHolders(tokenMint, network, holderRows);
        } catch (error) {
            this.logger.error(`Redis error in getTopHolders for "${tokenMint}":`, error);
            return [];
        }
    }

    async enrichHolders(tokenMint: string, network: string, rows: HolderEnrichmentInput[]): Promise<EnrichedHolder[]> {
        const redis = this.redisService.getClient();
        const { currentPriceUsd, totalSupply } = await this.getPriceAndSupply(tokenMint, network);
        const holders: EnrichedHolder[] = [];

        for (const row of rows) {
            const address = row.wallet;
            const redisData =
                row.redisData ??
                (redis
                    ? await redis.hgetall(`holder:${network}:${tokenMint}:${address}`).catch(() => ({}) as Record<string, string>)
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

    async getHolder(tokenMint: string, address: string): Promise<HolderData | null> {
        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const network = this.clusterProvider.cluster;
            const holderKey = `holder:${network}:${tokenMint}:${address}`;
            const data = await redis.hgetall(holderKey);

            if (!data || Object.keys(data).length === 0) return null;

            const balance = parseFloat(data.balance || "0");
            const costBasis = parseFloat(data.cost_basis || "0");
            const realizedPnl = parseFloat(data.realized_pnl || "0");

            // Fetch total supply for balance_percent calculation
            const supplyKey = `supply:${network}:${tokenMint}`;
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

    private queueHolderUpsert(event: HolderUpdateEvent, network: string): void {
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
            this.logger.error(`Failed to upsert ${rows.length} holder rows:`, error);
        }
    }

    private async deleteHolderState(event: HolderUpdateEvent, network: string): Promise<void> {
        try {
            await this.holderRepository.delete({ tokenMint: event.mint, network, wallet: event.wallet });
        } catch (error) {
            this.logger.error(`Failed to delete holder ${network}:${event.mint}:${event.wallet}:`, error);
        }
    }

    private async getPriceAndSupply(tokenMint: string, network: string): Promise<{ currentPriceUsd: number; totalSupply: number }> {
        const redis = this.redisService.getClient();
        const [priceData, totalSupplyStr] = redis
            ? await Promise.all([redis.hgetall(`price:${network}:${tokenMint}:latest`), redis.get(`supply:${network}:${tokenMint}`)])
            : [null, null];
        let currentPriceUsd = priceData ? this.toNumber(priceData.price_usd) : 0;
        let totalSupply = totalSupplyStr ? this.toNumber(totalSupplyStr) : 0;

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

        return { currentPriceUsd, totalSupply };
    }

    private holderBufferKey(network: string, mint: string, wallet: string): string {
        return `${network}:${mint}:${wallet}`;
    }

    private toDecimalString(value: unknown): string {
        if (value == null || value === "") return "0";
        return String(value);
    }

    private toNumber(value: unknown): number {
        const num = Number(value ?? 0);
        return Number.isFinite(num) ? num : 0;
    }

    private toInt(value: unknown): number {
        const num = parseInt(String(value ?? "0"), 10);
        return Number.isFinite(num) ? num : 0;
    }
}

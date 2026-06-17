import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { TokenSocketGateway } from "./token.socket.gateway";
import { ROOM_RULES, RoomDomain, RoomInterval, OhlcInterval, parseRoomIntervalMs } from "./room/room.constants";
import { PubSubService } from "../../../../redis/services/pubsub.service";
import { StatsAggregationService } from "../aggregation/stats-aggregation.service";
import { OhlcAggregationService } from "../aggregation/ohlc-aggregation.service";
import { TraderAggregationService } from "../aggregation/trader-aggregation.service";
import { HolderAggregationService } from "../aggregation/holder-aggregation.service";
import { SwapEvent, TradeData, HolderData, transformSwapToTradeForToken, calculateSwapPrices } from "../../types/swap-event.type";

const REDIS_TRADES_CHANNEL = "trades";

@Injectable()
export class TokenSocketService implements OnModuleInit {
    private readonly logger = new Logger(TokenSocketService.name);
    private readonly tradesBuffer = new Map<string, (TradeData & { token: string })[]>();
    private readonly lastEmittedClose = new Map<string, number>();
    private readonly previousHolders = new Map<string, Map<string, HolderData>>();

    constructor(
        private readonly gateway: TokenSocketGateway,
        private readonly pubSubService: PubSubService,
        private readonly statsAggregation: StatsAggregationService,
        private readonly ohlcAggregation: OhlcAggregationService,
        private readonly traderAggregation: TraderAggregationService,
        private readonly holderAggregation: HolderAggregationService
    ) {}

    async onModuleInit() {
        this.logger.log("Token socket service initialized");

        // Subscribe to Redis trades channel
        await this.subscribeToTrades();

        // Start schedulers for periodic data emission
        for (const domain of Object.keys(ROOM_RULES) as RoomDomain[]) {
            for (const interval of ROOM_RULES[domain]) {
                this.startScheduler(domain, interval);
            }
        }
    }

    private async subscribeToTrades(): Promise<void> {
        this.logger.log(`Subscribing to Redis channel: ${REDIS_TRADES_CHANNEL}`);

        await this.pubSubService.subscribe(REDIS_TRADES_CHANNEL, async (message) => {
            try {
                const swap = message as SwapEvent;
                await this.processSwapEvent(swap);
            } catch (error) {
                this.logger.error("Error processing swap event:", error);
            }
        });

        this.logger.log(`Subscribed to Redis channel: ${REDIS_TRADES_CHANNEL}`);
    }

    private async processSwapEvent(swap: SwapEvent): Promise<void> {
        const hasPriceUsd = swap.price_usd != null && swap.price_usd > 0;

        // trader/holder aggregation tracks token quantities and cost basis —
        // they use resolvePrice() internally, so they don't need price_usd upfront
        await Promise.all([this.traderAggregation.onSwapEvent(swap), this.holderAggregation.onSwapEvent(swap)]);

        // stats and OHLC require a valid USD price to be meaningful
        if (!hasPriceUsd) return;

        const prices = calculateSwapPrices(swap);

        await Promise.all([this.statsAggregation.onSwapEvent(swap, prices), this.ohlcAggregation.onSwapEvent(swap, prices)]);

        // Buffer trades for scheduler emission
        const [supplyOut, supplyIn] = await Promise.all([
            this.statsAggregation.getTotalSupply(swap.token_out.mint),
            this.statsAggregation.getTotalSupply(swap.token_in.mint)
        ]);

        const tradeDataTokenOut = transformSwapToTradeForToken(swap, swap.token_out.mint, prices.priceUsdTokenOut, prices.priceUsdTokenOut * supplyOut);
        this.bufferTrade(swap.token_out.mint, tradeDataTokenOut);
        await this.statsAggregation.storeTradeData(swap.token_out.mint, tradeDataTokenOut);

        const tradeDataTokenIn = transformSwapToTradeForToken(swap, swap.token_in.mint, prices.priceUsdTokenIn, prices.priceUsdTokenIn * supplyIn);
        this.bufferTrade(swap.token_in.mint, tradeDataTokenIn);
        await this.statsAggregation.storeTradeData(swap.token_in.mint, tradeDataTokenIn);
    }

    private startScheduler(domain: RoomDomain, interval: RoomInterval) {
        const intervalMs = parseRoomIntervalMs(interval);

        this.logger.log(`Start scheduler: domain=${domain}, interval=${interval}, emitEvery=${intervalMs}ms`);

        setInterval(async () => {
            const rooms = this.gateway.listTokenRooms(domain);
            for (const room of rooms) {
                if (!room.endsWith(`:${interval}`)) continue;

                if (domain === "priceOHLC") {
                    await this.emitOhlc(room, interval as OhlcInterval);
                } else {
                    const data = await this.buildData(domain, room, interval);
                    if (!data) continue;
                    this.gateway.emit(room, domain, data);
                }
            }
        }, intervalMs);
    }

    private async buildData(domain: RoomDomain, room: string, interval: RoomInterval): Promise<any> {
        const [, token] = room.split(":");

        switch (domain) {
            case "price": {
                const stats = await this.statsAggregation.getStats(token);
                return {
                    token,
                    price: stats.price,
                    timestamp: stats.timestamp
                };
            }

            case "stats": {
                const stats = await this.statsAggregation.getStats(token);
                return {
                    token,
                    ...stats
                };
            }

            case "volume": {
                const stats = await this.statsAggregation.getStats(token);
                return {
                    token,
                    volume: stats.volume["24h"],
                    timestamp: stats.timestamp
                };
            }

            case "trades":
            case "tx": {
                const buffered = this.tradesBuffer.get(token);
                if (!buffered || buffered.length === 0) return null;
                const trades = [...buffered];
                this.tradesBuffer.delete(token);
                return { token, trades };
            }

            case "top_traders": {
                const traders = await this.traderAggregation.getTopTraders(token, 10);
                if (traders.length === 0) return null;
                return {
                    token,
                    data: traders
                };
            }

            case "holders": {
                const holders = await this.holderAggregation.getTopHolders(token, 20);

                const prev = this.previousHolders.get(token) ?? new Map();
                const current = new Map(holders.map((h) => [h.address, h]));

                const changed = holders.filter((h) => {
                    const prevHolder = prev.get(h.address);
                    if (!prevHolder) return true;
                    return prevHolder.balance !== h.balance || prevHolder.tx_count !== h.tx_count;
                });

                const removed = [...prev.keys()].filter((addr) => !current.has(addr));

                this.previousHolders.set(token, current);

                if (changed.length === 0 && removed.length === 0) return null;

                return {
                    token,
                    changed,
                    removed
                };
            }

            default:
                return null;
        }
    }

    private async emitOhlc(room: string, ohlcInterval: OhlcInterval): Promise<void> {
        const [, token] = room.split(":");
        const bucketTime = this.ohlcAggregation.getBucketTimestamp(ohlcInterval) / 1000;
        const lastClose = this.lastEmittedClose.get(room);

        const currentOhlc = await this.ohlcAggregation.getOhlc(token, ohlcInterval);

        if (!currentOhlc) {
            // Bucket trống (không có swap) → emit flat candle từ lastClose
            if (lastClose == null) return;
            this.gateway.emit(room, "priceOHLC", {
                token,
                priceOHLC: {
                    open: lastClose,
                    close: lastClose,
                    high: lastClose,
                    low: lastClose
                },
                time: bucketTime
            });
            return;
        }

        if (currentOhlc.open === 0) return;

        // Override open = close của candle trước → đảm bảo liên tục trên FE
        const open = lastClose ?? currentOhlc.open;
        const candle = {
            open,
            close: currentOhlc.close,
            high: Math.max(open, currentOhlc.high),
            low: Math.min(open, currentOhlc.low)
        };

        this.gateway.emit(room, "priceOHLC", {
            token,
            priceOHLC: candle,
            time: bucketTime
        });
        this.lastEmittedClose.set(room, candle.close);
    }

    private bufferTrade(tokenMint: string, trade: TradeData): void {
        if (!this.tradesBuffer.has(tokenMint)) {
            this.tradesBuffer.set(tokenMint, []);
        }
        const buffer = this.tradesBuffer.get(tokenMint)!;
        if (buffer.some((t) => t.tx_hash === trade.tx_hash)) return;
        buffer.push({ token: tokenMint, ...trade });
    }
}

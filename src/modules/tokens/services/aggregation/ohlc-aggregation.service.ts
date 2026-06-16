import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { ClusterProvider } from "../../../../common/cluster/cluster.provider";
import { RedisService } from "../../../../redis/services/redis.service";
import { SwapEvent, OhlcData, SwapPriceResult } from "../../types/swap-event.types";
import { OhlcInterval } from "../socket/room/room.constants";
import { OhlcHistoryPoint } from "../../types/ohlc-aggregation.types";
import { OhlcPersistorService } from "./ohlc-persistor.service";

const INTERVAL_MS: Record<OhlcInterval, number> = {
    "10s": 10 * 1000,
    "1m": 60 * 1000,
    "5m": 5 * 60 * 1000
};

const INTERVAL_TTL: Record<OhlcInterval, number> = {
    "10s": 60 * 60, // 1 hour
    "1m": 6 * 60 * 60, // 6 hours
    "5m": 24 * 60 * 60 // 24 hours
};

@Injectable()
export class OhlcAggregationService {
    private readonly logger = new Logger(OhlcAggregationService.name);
    private readonly seenBuckets = new Map<string, number>();
    private isFlushingStaleBuckets = false;

    constructor(
        private readonly redisService: RedisService,
        private readonly clusterProvider: ClusterProvider,
        private readonly ohlcPersistor: OhlcPersistorService
    ) {}

    async onSwapEvent(swap: SwapEvent, prices: SwapPriceResult): Promise<void> {
        const intervals: OhlcInterval[] = ["10s", "1m", "5m"];

        for (const interval of intervals) {
            const network = this.eventNetwork(swap);
            await this.updateOhlc(swap.token_out.mint, network, interval, prices.priceUsdTokenOut, prices.volumeUsdTokenOut);
            await this.updateOhlc(swap.token_in.mint, network, interval, prices.priceUsdTokenIn, prices.volumeUsdTokenIn);
        }
    }

    async getOhlc(tokenMint: string, interval: OhlcInterval): Promise<OhlcData | null> {
        const network = this.clusterProvider.cluster;
        const redis = this.redisService.getClient();
        if (!redis) return null;

        try {
            const bucket = this.getBucketTimestamp(interval);
            const key = this.bucketKey(network, tokenMint, interval, bucket);
            const data = await redis.hgetall(key);

            if (!data || Object.keys(data).length === 0) {
                return null;
            }

            return {
                open: parseFloat(data.open) || 0,
                high: parseFloat(data.high) || 0,
                low: parseFloat(data.low) || 0,
                close: parseFloat(data.close) || 0,
                volume: parseFloat(data.volume) || 0
            };
        } catch (error) {
            this.logger.error(`Redis error in getOhlc for "${tokenMint}" interval "${interval}":`, error);
            return null;
        }
    }

    private async updateOhlc(tokenMint: string, network: string, interval: OhlcInterval, price: number, volume: number): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            const bucket = this.getBucketTimestamp(interval);
            const previousBucket = this.seenBuckets.get(`${network}:${tokenMint}:${interval}`);
            if (previousBucket != null && previousBucket !== bucket) {
                const previous = await this.readBucket(network, tokenMint, interval, previousBucket);
                if (previous) {
                    await this.ohlcPersistor.flushFinishedBucket(tokenMint, network, interval, previousBucket, previous);
                }
            }
            this.seenBuckets.set(`${network}:${tokenMint}:${interval}`, bucket);

            const bucketKey = this.bucketKey(network, tokenMint, interval, bucket);
            const lastCloseKey = `ohlc:${network}:${tokenMint}:${interval}:last_close`;

            const luaScript = `
      local bucketKey = KEYS[1]
      local lastCloseKey = KEYS[2]
      local price = tonumber(ARGV[1])
      local volume = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])

      local exists = redis.call('EXISTS', bucketKey)
      if exists == 0 then
        -- New bucket: open = previous candle's close (price at time "a")
        local prevClose = redis.call('GET', lastCloseKey)
        local openPrice = price
        if prevClose then
          openPrice = tonumber(prevClose)
        end

        redis.call('HSET', bucketKey, 'open', openPrice)
        redis.call('HSET', bucketKey, 'high', math.max(openPrice, price))
        redis.call('HSET', bucketKey, 'low', math.min(openPrice, price))
        redis.call('HSET', bucketKey, 'volume', 0)
      end

      -- Always update close to latest price
      redis.call('HSET', bucketKey, 'close', price)

      -- Update high if higher
      local currentHigh = tonumber(redis.call('HGET', bucketKey, 'high')) or 0
      if price > currentHigh then
        redis.call('HSET', bucketKey, 'high', price)
      end

      -- Update low if lower
      local currentLow = tonumber(redis.call('HGET', bucketKey, 'low')) or 0
      if price < currentLow or currentLow == 0 then
        redis.call('HSET', bucketKey, 'low', price)
      end

      -- Increment volume
      redis.call('HINCRBYFLOAT', bucketKey, 'volume', volume)

      -- Set TTL on bucket
      redis.call('EXPIRE', bucketKey, ttl)

      -- Persist last_close for next candle's open
      redis.call('SET', lastCloseKey, price)
      redis.call('EXPIRE', lastCloseKey, ttl * 3)

      return 1
    `;

            await redis.eval(luaScript, 2, bucketKey, lastCloseKey, price, volume, INTERVAL_TTL[interval]);
        } catch (error) {
            this.logger.error(`Redis error in updateOhlc for "${tokenMint}" interval "${interval}":`, error);
        }
    }

    async getHistoricalOhlc(
        tokenMint: string,
        interval: OhlcInterval,
        limit: number = 500,
        from?: number,
        to?: number
    ): Promise<Array<OhlcData & { timestamp: number }>> {
        const redis = this.redisService.getClient();
        if (!redis) return [];
        const network = this.clusterProvider.cluster;

        try {
            const intervalMs = INTERVAL_MS[interval];
            const endBucket = to ? Math.floor(to / intervalMs) * intervalMs : this.getBucketTimestamp(interval);
            const startBucket = from ? Math.floor(from / intervalMs) * intervalMs : endBucket - (limit - 1) * intervalMs;

            const buckets: number[] = [];
            for (let b = startBucket; b <= endBucket; b += intervalMs) {
                buckets.push(b);
            }
            const limitedBuckets = buckets.slice(-limit);

            const pipeline = redis.pipeline();
            for (const bucket of limitedBuckets) {
                pipeline.hgetall(this.bucketKey(network, tokenMint, interval, bucket));
            }

            const results = await pipeline.exec();
            if (!results) return [];
            const points: Array<OhlcData & { timestamp: number }> = [];

            for (let i = 0; i < limitedBuckets.length; i++) {
                const data = results[i][1] as Record<string, string> | null;
                if (data && Object.keys(data).length > 0) {
                    points.push({
                        timestamp: limitedBuckets[i],
                        open: parseFloat(data.open) || 0,
                        high: parseFloat(data.high) || 0,
                        low: parseFloat(data.low) || 0,
                        close: parseFloat(data.close) || 0,
                        volume: parseFloat(data.volume) || 0
                    });
                }
            }

            return points;
        } catch (error) {
            this.logger.error(`Redis error in getHistoricalOhlc for "${tokenMint}" interval "${interval}":`, error);
            return [];
        }
    }

    getBucketTimestamp(interval: OhlcInterval): number {
        const now = Date.now();
        const intervalMs = INTERVAL_MS[interval];
        return Math.floor(now / intervalMs) * intervalMs;
    }

    async getOhlcData(tokenMint: string, interval: string, limit: number = 500): Promise<OhlcHistoryPoint[]> {
        const redis = this.redisService.getClient();
        if (!redis) return [];

        try {
            // Map common interval formats
            const intervalMap: Record<string, OhlcInterval> = {
                "10s": "10s",
                "1m": "1m",
                "5m": "5m",
                "15m": "5m", // fallback to 5m
                "1h": "5m", // fallback to 5m
                "4h": "5m", // fallback to 5m
                "1d": "5m", // fallback to 5m
                "1w": "5m" // fallback to 5m
            };

            const ohlcInterval = intervalMap[interval] || "1m";
            const intervalMs = INTERVAL_MS[ohlcInterval];
            const now = Date.now();
            const data: OhlcHistoryPoint[] = [];

            // Fetch historical buckets
            const network = this.clusterProvider.cluster;
            for (let i = limit - 1; i >= 0; i--) {
                const bucketTime = Math.floor((now - i * intervalMs) / intervalMs) * intervalMs;
                const key = this.bucketKey(network, tokenMint, ohlcInterval, bucketTime);
                const ohlcData = await redis.hgetall(key);

                if (ohlcData && Object.keys(ohlcData).length > 0) {
                    data.push({
                        timestamp: bucketTime,
                        open: parseFloat(ohlcData.open) || 0,
                        high: parseFloat(ohlcData.high) || 0,
                        low: parseFloat(ohlcData.low) || 0,
                        close: parseFloat(ohlcData.close) || 0,
                        volume: parseFloat(ohlcData.volume) || 0
                    });
                }
            }

            return data;
        } catch (error) {
            this.logger.error(`Redis error in getOhlcData for "${tokenMint}":`, error);
            return [];
        }
    }

    @Cron("0 * * * * *")
    async flushStaleBucketsFromRedis(): Promise<void> {
        if (this.isFlushingStaleBuckets) return;
        const redis = this.redisService.getClient();
        if (!redis) return;

        this.isFlushingStaleBuckets = true;
        try {
            for (const interval of Object.keys(INTERVAL_MS) as OhlcInterval[]) {
                const intervalMs = INTERVAL_MS[interval];
                const staleBefore = Math.floor((Date.now() - intervalMs * 2) / intervalMs) * intervalMs;
                let cursor = "0";

                do {
                    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `ohlc:*:*:${interval}:*`, "COUNT", 250);
                    cursor = nextCursor;

                    for (const key of keys) {
                        const parsed = this.parseBucketKey(key);
                        if (!parsed || parsed.interval !== interval || parsed.bucket >= staleBefore) continue;

                        const candle = await this.readBucket(parsed.network, parsed.tokenMint, parsed.interval, parsed.bucket);
                        if (!candle) continue;

                        await this.ohlcPersistor.flushFinishedBucket(parsed.tokenMint, parsed.network, parsed.interval, parsed.bucket, candle);
                    }
                } while (cursor !== "0");
            }
        } catch (error) {
            this.logger.error("Failed to flush stale OHLC Redis buckets:", error);
        } finally {
            this.isFlushingStaleBuckets = false;
        }
    }

    private eventNetwork(swap: SwapEvent): string {
        return swap.network || "mainnet";
    }

    private bucketKey(network: string, tokenMint: string, interval: OhlcInterval, bucket: number): string {
        return `ohlc:${network}:${tokenMint}:${interval}:${bucket}`;
    }

    private parseBucketKey(key: string): { network: string; tokenMint: string; interval: OhlcInterval; bucket: number } | null {
        const [prefix, network, tokenMint, interval, bucketRaw] = key.split(":");
        if (prefix !== "ohlc" || !network || !tokenMint || !this.isOhlcInterval(interval)) return null;
        const bucket = Number(bucketRaw);
        if (!Number.isFinite(bucket)) return null;
        return { network, tokenMint, interval, bucket };
    }

    private isOhlcInterval(value: string): value is OhlcInterval {
        return value in INTERVAL_MS;
    }

    private async readBucket(network: string, tokenMint: string, interval: OhlcInterval, bucket: number): Promise<OhlcData | null> {
        const redis = this.redisService.getClient();
        if (!redis) return null;
        const data = await redis.hgetall(this.bucketKey(network, tokenMint, interval, bucket));
        if (!data || Object.keys(data).length === 0) return null;
        return {
            open: parseFloat(data.open) || 0,
            high: parseFloat(data.high) || 0,
            low: parseFloat(data.low) || 0,
            close: parseFloat(data.close) || 0,
            volume: parseFloat(data.volume) || 0
        };
    }
}

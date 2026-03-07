import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../redis/services/redis.service';
import {
  SwapEvent,
  OhlcData,
  SwapPriceResult,
} from '../../types/swap-event.type';
import { OhlcInterval } from '../socket/room/room.constants';

const INTERVAL_MS: Record<OhlcInterval, number> = {
  '10s': 10 * 1000,
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
};

const INTERVAL_TTL: Record<OhlcInterval, number> = {
  '10s': 60 * 60, // 1 hour
  '1m': 6 * 60 * 60, // 6 hours
  '5m': 24 * 60 * 60, // 24 hours
};

@Injectable()
export class OhlcAggregationService {
  private readonly logger = new Logger(OhlcAggregationService.name);

  constructor(private readonly redisService: RedisService) {}

  async onSwapEvent(swap: SwapEvent, prices: SwapPriceResult): Promise<void> {
    const intervals: OhlcInterval[] = ['10s', '1m', '5m'];

    for (const interval of intervals) {
      await this.updateOhlc(
        swap.token_out.mint,
        interval,
        prices.priceUsdTokenOut,
        prices.volumeUsdTokenOut,
      );
      await this.updateOhlc(
        swap.token_in.mint,
        interval,
        prices.priceUsdTokenIn,
        prices.volumeUsdTokenIn,
      );
    }
  }

  async getOhlc(
    tokenMint: string,
    interval: OhlcInterval,
  ): Promise<OhlcData | null> {
    const redis = this.redisService.getClient();
    if (!redis) return null;

    try {
      const bucket = this.getBucketTimestamp(interval);
      const key = `ohlc:${tokenMint}:${interval}:${bucket}`;
      const data = await redis.hgetall(key);

      if (!data || Object.keys(data).length === 0) {
        return null;
      }

      return {
        open: parseFloat(data.open) || 0,
        high: parseFloat(data.high) || 0,
        low: parseFloat(data.low) || 0,
        close: parseFloat(data.close) || 0,
        volume: parseFloat(data.volume) || 0,
      };
    } catch (error) {
      this.logger.error(
        `Redis error in getOhlc for "${tokenMint}" interval "${interval}":`,
        error,
      );
      return null;
    }
  }

  private async updateOhlc(
    tokenMint: string,
    interval: OhlcInterval,
    price: number,
    volume: number,
  ): Promise<void> {
    const redis = this.redisService.getClient();
    if (!redis) return;

    try {
      const bucket = this.getBucketTimestamp(interval);
      const bucketKey = `ohlc:${tokenMint}:${interval}:${bucket}`;
      const lastCloseKey = `ohlc:${tokenMint}:${interval}:last_close`;

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

      await redis.eval(
        luaScript,
        2,
        bucketKey,
        lastCloseKey,
        price,
        volume,
        INTERVAL_TTL[interval],
      );
    } catch (error) {
      this.logger.error(
        `Redis error in updateOhlc for "${tokenMint}" interval "${interval}":`,
        error,
      );
    }
  }

  getBucketTimestamp(interval: OhlcInterval): number {
    const now = Date.now();
    const intervalMs = INTERVAL_MS[interval];
    return Math.floor(now / intervalMs) * intervalMs;
  }
}

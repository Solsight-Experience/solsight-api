import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../redis/services/redis.service';
import { SwapEvent, OhlcData } from '../../types/swap-event.type';

type OhlcInterval = '10s' | '1m' | '5m';

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

  async onSwapEvent(swap: SwapEvent): Promise<void> {
    const priceNative = swap.price_native;
    const priceUsdTokenOut = swap.price_usd ?? 0;
    const priceUsdTokenIn = priceNative > 0 ? priceUsdTokenOut / priceNative : 0;

    // Volume (USD) cho mỗi token
    const volumeTokenOut = swap.token_out.amount_ui * priceUsdTokenOut;
    const volumeTokenIn = swap.token_in.amount_ui * priceUsdTokenIn;

    const intervals: OhlcInterval[] = ['10s', '1m', '5m'];

    for (const interval of intervals) {
      // Update OHLC cho token_out
      await this.updateOhlc(swap.token_out.mint, interval, priceUsdTokenOut, volumeTokenOut);
      // Update OHLC cho token_in
      await this.updateOhlc(swap.token_in.mint, interval, priceUsdTokenIn, volumeTokenIn);
    }
  }

  async getOhlc(tokenMint: string, interval: OhlcInterval): Promise<OhlcData | null> {
    const bucket = this.getBucketTimestamp(interval);
    const key = `ohlc:${tokenMint}:${interval}:${bucket}`;

    const redis = this.redisService.getClient();
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
  }

  private async updateOhlc(
    tokenMint: string,
    interval: OhlcInterval,
    price: number,
    volume: number,
  ): Promise<void> {
    const bucket = this.getBucketTimestamp(interval);
    const key = `ohlc:${tokenMint}:${interval}:${bucket}`;

    const redis = this.redisService.getClient();

    // Use Lua script for atomic OHLC update
    const luaScript = `
      local key = KEYS[1]
      local price = tonumber(ARGV[1])
      local volume = tonumber(ARGV[2])
      local ttl = tonumber(ARGV[3])

      -- Set open only if not exists
      local exists = redis.call('EXISTS', key)
      if exists == 0 then
        redis.call('HSET', key, 'open', price)
        redis.call('HSET', key, 'high', price)
        redis.call('HSET', key, 'low', price)
        redis.call('HSET', key, 'volume', 0)
      end

      -- Always update close
      redis.call('HSET', key, 'close', price)

      -- Update high if higher
      local currentHigh = tonumber(redis.call('HGET', key, 'high')) or 0
      if price > currentHigh then
        redis.call('HSET', key, 'high', price)
      end

      -- Update low if lower
      local currentLow = tonumber(redis.call('HGET', key, 'low')) or 0
      if price < currentLow or currentLow == 0 then
        redis.call('HSET', key, 'low', price)
      end

      -- Increment volume
      redis.call('HINCRBYFLOAT', key, 'volume', volume)

      -- Set TTL
      redis.call('EXPIRE', key, ttl)

      return 1
    `;

    await redis.eval(luaScript, 1, key, price, volume, INTERVAL_TTL[interval]);
  }

  private getBucketTimestamp(interval: OhlcInterval): number {
    const now = Date.now();
    const intervalMs = INTERVAL_MS[interval];
    return Math.floor(now / intervalMs) * intervalMs;
  }

}

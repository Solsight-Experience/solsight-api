import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../../../redis/services/redis.service';
import { SwapEvent, HolderData } from '../../types/swap-event.type';

const HOLDER_TTL = 24 * 60 * 60; // 24 hours

@Injectable()
export class HolderAggregationService {
  private readonly logger = new Logger(HolderAggregationService.name);

  constructor(private readonly redisService: RedisService) {}

  async onSwapEvent(swap: SwapEvent): Promise<void> {
    const tokenMint = this.getTokenMint(swap);
    const holderAddress = swap.maker;
    const isBuy = swap.direction === 'BUY';

    const tokenAmount = isBuy ? swap.token_out.amount_ui : swap.token_in.amount_ui;
    const price = swap.price_usd ?? swap.price_native;
    const volumeUsd = tokenAmount * price;

    const holderKey = `holder:${tokenMint}:${holderAddress}`;
    const rankingKey = `holders:${tokenMint}:by_balance`;

    const redis = this.redisService.getClient();
    const now = Date.now();

    // Update holder stats
    if (isBuy) {
      await redis.hincrbyfloat(holderKey, 'balance', tokenAmount);
      await redis.hincrbyfloat(holderKey, 'total_bought', volumeUsd);
    } else {
      await redis.hincrbyfloat(holderKey, 'balance', -tokenAmount);
      await redis.hincrbyfloat(holderKey, 'total_sold', volumeUsd);
    }

    await redis.hincrby(holderKey, 'tx_count', 1);

    // Set first_tx_time if not exists
    const firstTx = await redis.hget(holderKey, 'first_tx_time');
    if (!firstTx) {
      await redis.hset(holderKey, 'first_tx_time', now);
    }

    // Always update last_tx_time
    await redis.hset(holderKey, 'last_tx_time', now);

    await redis.expire(holderKey, HOLDER_TTL);

    // Update ranking by balance
    const balance = parseFloat((await redis.hget(holderKey, 'balance')) || '0');
    if (balance > 0) {
      await redis.zadd(rankingKey, balance, holderAddress);
    } else {
      // Remove from ranking if balance is 0 or negative
      await redis.zrem(rankingKey, holderAddress);
    }
    await redis.expire(rankingKey, HOLDER_TTL);
  }

  async getTopHolders(tokenMint: string, limit = 20): Promise<HolderData[]> {
    const redis = this.redisService.getClient();
    const rankingKey = `holders:${tokenMint}:by_balance`;

    // Get top holders by balance (descending order)
    const topAddresses = await redis.zrevrange(rankingKey, 0, limit - 1);

    const holders: HolderData[] = [];

    for (const address of topAddresses) {
      const holderKey = `holder:${tokenMint}:${address}`;
      const data = await redis.hgetall(holderKey);

      if (data && Object.keys(data).length > 0) {
        holders.push({
          address,
          name: null, // No name resolution without RPC
          balance: parseFloat(data.balance || '0'),
          balance_percent: 0, // Would need total supply
          avg_buy_price: 0, // Would need price history
          total_bought: parseFloat(data.total_bought || '0'),
          total_sold: parseFloat(data.total_sold || '0'),
          realized_pnl: 0, // Would need price tracking
          unrealized_pnl: 0, // Would need price tracking
          total_pnl: 0,
          roi_percent: 0, // Would need price tracking
          first_tx_time: parseInt(data.first_tx_time || '0', 10),
          last_tx_time: parseInt(data.last_tx_time || '0', 10),
          tx_count: parseInt(data.tx_count || '0', 10),
        });
      }
    }

    return holders;
  }

  async getHolder(tokenMint: string, address: string): Promise<HolderData | null> {
    const redis = this.redisService.getClient();
    const holderKey = `holder:${tokenMint}:${address}`;

    const data = await redis.hgetall(holderKey);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    return {
      address,
      name: null,
      balance: parseFloat(data.balance || '0'),
      balance_percent: 0,
      avg_buy_price: 0,
      total_bought: parseFloat(data.total_bought || '0'),
      total_sold: parseFloat(data.total_sold || '0'),
      realized_pnl: 0,
      unrealized_pnl: 0,
      total_pnl: 0,
      roi_percent: 0,
      first_tx_time: parseInt(data.first_tx_time || '0', 10),
      last_tx_time: parseInt(data.last_tx_time || '0', 10),
      tx_count: parseInt(data.tx_count || '0', 10),
    };
  }

  private getTokenMint(swap: SwapEvent): string {
    if (!swap.token_in.is_quote) {
      return swap.token_in.mint;
    }
    return swap.token_out.mint;
  }
}

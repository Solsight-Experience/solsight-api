import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TokenSocketGateway } from './token.socket.gateway';
import {
  ROOM_RULES,
  RoomDomain,
  RoomInterval,
  parseRoomIntervalMs,
} from './room/room.constants';
import { PubSubService } from '../../../../redis/services/pubsub.service';
import { StatsAggregationService } from '../aggregation/stats-aggregation.service';
import { OhlcAggregationService } from '../aggregation/ohlc-aggregation.service';
import { TraderAggregationService } from '../aggregation/trader-aggregation.service';
import { HolderAggregationService } from '../aggregation/holder-aggregation.service';
import {
  SwapEvent,
  transformSwapToTradeForToken,
} from '../../types/swap-event.type';

const REDIS_TRADES_CHANNEL = 'trades';

@Injectable()
export class TokenSocketService implements OnModuleInit {
  private readonly logger = new Logger(TokenSocketService.name);

  constructor(
    private readonly gateway: TokenSocketGateway,
    private readonly pubSubService: PubSubService,
    private readonly statsAggregation: StatsAggregationService,
    private readonly ohlcAggregation: OhlcAggregationService,
    private readonly traderAggregation: TraderAggregationService,
    private readonly holderAggregation: HolderAggregationService,
  ) {}

  async onModuleInit() {
    this.logger.log('Token socket service initialized');

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
        this.logger.error('Error processing swap event:', error);
      }
    });

    this.logger.log(`Subscribed to Redis channel: ${REDIS_TRADES_CHANNEL}`);
  }

  private async processSwapEvent(swap: SwapEvent): Promise<void> {
    // Update all aggregations
    await Promise.all([
      this.statsAggregation.onSwapEvent(swap),
      this.ohlcAggregation.onSwapEvent(swap),
      this.traderAggregation.onSwapEvent(swap),
      this.holderAggregation.onSwapEvent(swap),
    ]);

    // Calculate prices for both tokens
    const priceNative = swap.price_native;
    const priceUsdTokenOut = swap.price_usd ?? 0;
    const priceUsdTokenIn = priceNative > 0 ? priceUsdTokenOut / priceNative : 0;

    // Emit real-time trade to subscribed rooms for BOTH tokens
    const tradeRooms = this.gateway.listTokenRooms('trades');
    const txRooms = this.gateway.listTokenRooms('tx');
    const allRooms = [...tradeRooms, ...txRooms];

    // Emit for token_out (BUY)
    const tradeDataTokenOut = transformSwapToTradeForToken(swap, swap.token_out.mint, priceUsdTokenOut);
    for (const room of allRooms) {
      const [, roomToken] = room.split(':');
      if (roomToken === swap.token_out.mint) {
        const eventName = room.startsWith('trades') ? 'trades' : 'tx';
        this.gateway.emit(room, eventName, { token: swap.token_out.mint, ...tradeDataTokenOut });
      }
    }

    // Emit for token_in (SELL)
    const tradeDataTokenIn = transformSwapToTradeForToken(swap, swap.token_in.mint, priceUsdTokenIn);
    for (const room of allRooms) {
      const [, roomToken] = room.split(':');
      if (roomToken === swap.token_in.mint) {
        const eventName = room.startsWith('trades') ? 'trades' : 'tx';
        this.gateway.emit(room, eventName, { token: swap.token_in.mint, ...tradeDataTokenIn });
      }
    }
  }

  private startScheduler(domain: RoomDomain, interval: RoomInterval) {
    const intervalMs = parseRoomIntervalMs(interval);

    this.logger.log(`Start scheduler: domain=${domain}, interval=${interval}`);

    setInterval(async () => {
      const rooms = this.gateway.listTokenRooms(domain);
      for (const room of rooms) {
        if (!room.endsWith(`:${interval}`)) continue;

        const data = await this.buildData(domain, room, interval);
        if (!data) continue;

        this.gateway.emit(room, domain, data);
      }
    }, intervalMs);
  }

  private async buildData(
    domain: RoomDomain,
    room: string,
    interval: RoomInterval,
  ): Promise<any> {
    const [, token] = room.split(':');

    switch (domain) {
      case 'price': {
        const stats = await this.statsAggregation.getStats(token);
        return {
          token,
          price: stats.price,
          timestamp: stats.timestamp,
        };
      }

      case 'stats': {
        const stats = await this.statsAggregation.getStats(token);
        return {
          token,
          ...stats,
        };
      }

      case 'volume': {
        const stats = await this.statsAggregation.getStats(token);
        return {
          token,
          volume: stats.volume['24h'],
          timestamp: stats.timestamp,
        };
      }

      case 'trades':
      case 'tx': {
        // Real-time trades are emitted in processSwapEvent
        // This scheduler can return null since trades are pushed on-demand
        return null;
      }

      case 'top_traders': {
        const traders = await this.traderAggregation.getTopTraders(token, 1);
        if (traders.length === 0) return null;
        return {
          token,
          data: traders[0],
        };
      }

      case 'holders': {
        const holders = await this.holderAggregation.getTopHolders(token, 1);
        if (holders.length === 0) return null;
        return {
          token,
          data: holders[0],
        };
      }

      case 'priceOHLC': {
        const ohlcInterval = interval as '10s' | '1m' | '5m';
        const ohlc = await this.ohlcAggregation.getOhlc(token, ohlcInterval);
        if (!ohlc) {
          // Return current price as OHLC if no data
          const stats = await this.statsAggregation.getStats(token);
          return {
            token,
            priceOHLC: {
              open: stats.price,
              close: stats.price,
              high: stats.price,
              low: stats.price,
            },
            time: stats.timestamp,
          };
        }
        return {
          token,
          priceOHLC: {
            open: ohlc.open,
            close: ohlc.close,
            high: ohlc.high,
            low: ohlc.low,
          },
          time: Date.now() / 1000,
        };
      }

      default:
        return null;
    }
  }
}

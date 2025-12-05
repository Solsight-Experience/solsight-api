import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebsocketGateway } from '../../../../websocket/websocket.gateway';
import {
  getRandomTrade,
  getRandomTokenStats,
  getRandomTopTrader,
  getRandomHolder,
} from './token.socket.mock';

@Injectable()
export class TokenSocketService implements OnModuleInit {
  private readonly logger = new Logger(TokenSocketService.name);
  constructor(private readonly websocketGateway: WebsocketGateway) {}

  onModuleInit() {
    this.logger.log('Token socket service initialized.');
    this.startTokenStatsStream();
    this.startTradeStream();
    this.startTopTradersStream();
    this.startHolderStream();
    this.startPriceStream();
    this.startVolumeStream();
  }

  startPriceStream() {
    setInterval(() => {
      const newPrice = {
        price: getRandomTokenStats().price,
        timestamp: getRandomTokenStats().timestamp,
      };
      this.websocketGateway.emitTokenEvent(
        'So11111111111111111111111111111111111111112',
        'price',
        newPrice,
      );
    }, 5000);
  }

  startTokenStatsStream() {
    setInterval(() => {
      const newTokenStats = getRandomTokenStats();
      this.websocketGateway.emitTokenEvent(
        'So11111111111111111111111111111111111111112',
        'stats',
        newTokenStats,
      );
    }, 5000);
  }

  startVolumeStream() {
    setInterval(() => {
      const newVolume = {
        volume: getRandomTokenStats().volume['24h'],
        timestamp: getRandomTokenStats().timestamp,
      };
      this.websocketGateway.emitTokenEvent(
        'So11111111111111111111111111111111111111112',
        'volume',
        newVolume,
      );
    }, 20000);
  }

  startTradeStream() {
    setInterval(() => {
      const newTrade = getRandomTrade();
      const token = 'So11111111111111111111111111111111111111112';
      this.websocketGateway.emitTokenEvent(token, 'trades', newTrade);
    }, 3000);
  }

  startTopTradersStream() {
    setInterval(() => {
      const newTopTrader = getRandomTopTrader();
      this.websocketGateway.emitTokenEvent(
        'So11111111111111111111111111111111111111112',
        'top_traders',
        newTopTrader,
      );
    }, 5000);
  }

  startHolderStream() {
    setInterval(() => {
      const newHolder = getRandomHolder();
      this.websocketGateway.emitTokenEvent(
        'So11111111111111111111111111111111111111112',
        'holders',
        newHolder,
      );
    }, 5000);
  }
}

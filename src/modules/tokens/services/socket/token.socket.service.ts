import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TokenSocketGateway } from './token.socket.gateway';
import {
  ROOM_RULES,
  RoomDomain,
  RoomInterval,
  parseRoomIntervalMs,
} from './room/room.constants';
import {
  getRandomTrade,
  getRandomTokenStats,
  getRandomTopTrader,
  getRandomHolder,
} from './token.socket.mock';

@Injectable()
export class TokenSocketService implements OnModuleInit {
  private readonly logger = new Logger(TokenSocketService.name);

  constructor(private readonly gateway: TokenSocketGateway) {}

  onModuleInit() {
    this.logger.log('Token socket service initialized');

    for (const domain of Object.keys(ROOM_RULES) as RoomDomain[]) {
      for (const interval of ROOM_RULES[domain]) {
        this.startScheduler(domain, interval);
      }
    }
  }

  private startScheduler(domain: RoomDomain, interval: RoomInterval) {
    const intervalMs = parseRoomIntervalMs(interval);

    this.logger.log(`Start scheduler: domain=${domain}, interval=${interval}`);

    setInterval(() => {
      const rooms = this.gateway.listTokenRooms(domain);
      for (const room of rooms) {
        if (!room.endsWith(`:${interval}`)) continue;

        const data = this.buildData(domain, room);
        if (!data) continue;

        console.log(`Emitting to room ${room}`);
        this.gateway.emit(room, domain, data);
      }
    }, intervalMs);
  }

  private buildData(domain: RoomDomain, room: string) {
    const [, token] = room.split(':');

    switch (domain) {
      case 'price': {
        const stats = getRandomTokenStats();
        return {
          token,
          price: stats.price,
          timestamp: stats.timestamp,
        };
      }

      case 'stats': {
        return {
          token,
          ...getRandomTokenStats(),
        };
      }

      case 'volume': {
        const stats = getRandomTokenStats();
        return {
          token,
          volume: stats.volume['24h'],
          timestamp: stats.timestamp,
        };
      }

      case 'trades': {
        return {
          token,
          ...getRandomTrade(),
        };
      }

      case 'top_traders': {
        return {
          token,
          data: getRandomTopTrader(),
        };
      }

      case 'holders': {
        return {
          token,
          data: getRandomHolder(),
        };
      }

      case 'chart': {
        const stats = getRandomTokenStats();
        return {
          token,
          open: stats.price * 0.98,
          close: stats.price,
          high: stats.price * 1.02,
          low: stats.price * 0.96,
          timestamp: stats.timestamp,
        };
      }

      case 'tx': {
        return {
          token,
          ...getRandomTrade(),
        };
      }

      default:
        return null;
    }
  }
}

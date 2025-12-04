import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebsocketGateway } from '../../../../websocket/websocket.gateway';

@Injectable()
export class TokenSocketService implements OnModuleInit {
  private readonly logger = new Logger(TokenSocketService.name);
  constructor(private readonly websocketGateway: WebsocketGateway) {}

  onModuleInit() {
    this.logger.log('Token socket service initialized.');
    this.startTradeStream();
    this.startTopTradersStream();
    this.startHolderStream();
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

function getRandomTrade() {
  return {
    tx_hash: Math.random().toString(36).substring(2, 15), // random string
    timestamp: Date.now(),
    type: Math.random() > 0.5 ? 'BUY' : 'SELL',
    amount_token: parseFloat((Math.random() * 100).toFixed(2)),
    amount_sol: parseFloat((Math.random() * 50).toFixed(3)),
    price: parseFloat((Math.random() * 2).toFixed(4)),
    price_usd: parseFloat((Math.random() * 100).toFixed(2)),
    market_cap: parseFloat((Math.random() * 1000000).toFixed(0)),
    trader_address: 'So' + Math.random().toString(36).substring(2, 15),
    tx_url:
      'https://solscan.io/tx/' + Math.random().toString(36).substring(2, 15),
  };
}

function getRandomTopTrader() {
  return {
    address: 'So' + Math.random().toString(36).substring(2, 15),
    name:
      Math.random() > 0.5 ? `Trader_${Math.floor(Math.random() * 1000)}` : null,
    total_pnl: parseFloat((Math.random() * 500 - 250).toFixed(2)), // -250 → +250
    roi_percent: parseFloat((Math.random() * 200 - 50).toFixed(2)), // -50% → +150%
    total_bought: parseFloat((Math.random() * 1000).toFixed(2)),
    total_sold: parseFloat((Math.random() * 1000).toFixed(2)),
    win_rate: parseFloat((Math.random() * 100).toFixed(2)),
    trades_count: Math.floor(Math.random() * 100),
  };
}

function getRandomHolder() {
  const balance = parseFloat((Math.random() * 100000).toFixed(2));
  const totalBought = parseFloat((Math.random() * 100000).toFixed(2));
  const totalSold = parseFloat((Math.random() * totalBought).toFixed(2)); // hợp lý hơn: sold <= bought
  const realizedPnl = parseFloat((Math.random() * 5000 - 2000).toFixed(2)); // -2k → +3k
  const unrealizedPnl = parseFloat((Math.random() * 5000 - 2000).toFixed(2));

  return {
    address: 'So' + Math.random().toString(36).substring(2, 15),
    name:
      Math.random() > 0.5
        ? `Holder_${Math.floor(Math.random() * 10000)}`
        : null,

    balance,
    balance_percent: parseFloat((Math.random() * 100).toFixed(2)), // 0 → 100%
    avg_buy_price: parseFloat((Math.random() * 2).toFixed(6)), // giá token hợp lý
    total_bought: totalBought,
    total_sold: totalSold,

    realized_pnl: realizedPnl,
    unrealized_pnl: unrealizedPnl,
    total_pnl: parseFloat((realizedPnl + unrealizedPnl).toFixed(2)),

    roi_percent: parseFloat((Math.random() * 200 - 50).toFixed(2)), // -50% → +150%

    first_tx_time:
      Date.now() - Math.floor(Math.random() * 60 * 24 * 3600 * 1000), // random 60 ngày
    last_tx_time: Date.now() - Math.floor(Math.random() * 24 * 3600 * 1000), // random 24h

    tx_count: Math.floor(Math.random() * 200),
  };
}

export function getRandomTokenPrice() {
  return {
    timestamp: Date.now(),
    price: parseFloat((Math.random() * 2).toFixed(4)), // 0–2
  };
}

export function getRandomTokenVolume() {
  return {
    timestamp: Date.now(),
    volume: parseFloat((Math.random() * 100).toFixed(2)), // 0–100
  };
}

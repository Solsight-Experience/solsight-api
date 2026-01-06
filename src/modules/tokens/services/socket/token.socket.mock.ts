function randomAround(base: number, percent = 1) {
  const factor = 1 + (Math.random() * 2 - 1) * (percent / 100);
  return parseFloat((base * factor).toFixed(2));
}

function randomChangePercent(percent = 0.1) {
  return parseFloat(((Math.random() * 2 - 1) * percent).toFixed(2)); // ±percent %
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function calcVolatility(
  elapsedMs: number,
  minPercent: number,
  maxPercent: number,
  scaleMs = 60 * 1000,
) {
  const factor = clamp(elapsedMs / scaleMs, 0, 1);
  return minPercent + (maxPercent - minPercent) * factor;
}

function nextValue(
  last: number,
  base: number,
  elapsedMs: number,
  stepMinPct: number,
  stepMaxPct: number,
  devMinPct: number,
  devMaxPct: number,
) {
  const stepPct = calcVolatility(elapsedMs, stepMinPct, stepMaxPct);
  const deltaPct = randomChangePercent(stepPct);
  const next = last * (1 + deltaPct / 100);

  const devPct = calcVolatility(elapsedMs, devMinPct, devMaxPct);
  const min = base * (1 - devPct / 100);
  const max = base * (1 + devPct / 100);
  return clamp(next, min, max);
}

let lastStatsTimestamp = 0;
let lastStats: {
  price: number;
  market_cap: number;
  liquidity: number;
  holders: number;
  txs: number;
  volume: number;
} | null = null;

export function getRandomTokenStats() {
  const basePrice = 140;
  const baseMarketCap = 79_000_000_000;
  const baseLiquidity = 167_000_000;
  const baseHolders = 3_000_000;
  const baseTxs = 200_000_000;
  const baseVolume = 100_000_000;

  const timestamp = Date.now() / 1000;
  const elapsedMs =
    lastStatsTimestamp > 0 ? timestamp - lastStatsTimestamp : 60 * 1000;

  if (!lastStats) {
    lastStats = {
      price: randomAround(basePrice, 0.5),
      market_cap: randomAround(baseMarketCap, 0.5),
      liquidity: randomAround(baseLiquidity, 0.5),
      holders: randomAround(baseHolders, 0.5),
      txs: Math.round(randomAround(baseTxs, 0.5)),
      volume: randomAround(baseVolume, 0.5),
    };
  }

  const price = nextValue(lastStats.price, basePrice, elapsedMs, 0.2, 4, 2, 20);
  const marketCap = nextValue(
    lastStats.market_cap,
    baseMarketCap,
    elapsedMs,
    0.15,
    3.5,
    2,
    25,
  );
  const liquidity = nextValue(
    lastStats.liquidity,
    baseLiquidity,
    elapsedMs,
    0.2,
    4,
    2,
    30,
  );
  const holders = nextValue(
    lastStats.holders,
    baseHolders,
    elapsedMs,
    0.1,
    2,
    1,
    15,
  );
  const txs = Math.round(
    nextValue(lastStats.txs, baseTxs, elapsedMs, 0.3, 5, 2, 30),
  );
  const volume = nextValue(
    lastStats.volume,
    baseVolume,
    elapsedMs,
    0.3,
    5,
    2,
    35,
  );

  const priceChange24h = randomChangePercent(calcVolatility(elapsedMs, 0.2, 6));
  const marketCapChange24h = randomChangePercent(
    calcVolatility(elapsedMs, 0.2, 6),
  );
  const liquidityChange24h = randomChangePercent(
    calcVolatility(elapsedMs, 0.2, 6),
  );
  const holdersChange24h = randomChangePercent(
    calcVolatility(elapsedMs, 0.1, 3),
  );
  const txsChange24h = randomChangePercent(calcVolatility(elapsedMs, 0.2, 6));
  const volumeChange24h = randomChangePercent(
    calcVolatility(elapsedMs, 0.2, 7),
  );

  lastStats = {
    price,
    market_cap: marketCap,
    liquidity,
    holders,
    txs,
    volume,
  };
  lastStatsTimestamp = timestamp;

  return {
    timestamp,

    // đổi display → nhóm đúng cấu trúc TokenDetail
    price: price,
    price_change: {
      '24h': priceChange24h,
    },

    market_cap: marketCap,
    market_cap_change_24h: marketCapChange24h,

    liquidity: liquidity,
    liquidity_change_24h: liquidityChange24h,

    holders: {
      count: holders,
      change_24h: holdersChange24h,
    },

    volume: {
      '24h': volume,
    },
    volume_change_24h: volumeChange24h,

    txns: {
      '24h': {
        total: txs,
        buys: Math.round(txs * 0.5),
        sells: Math.round(txs * 0.5),
      },
    },
    txns_change_24h: txsChange24h,
  };
}

let lastOhlcTimestamp = 0;
let lastOhlcClose: number | null = null;

export function getRandomOhlc(basePrice: number) {
  const timestamp = Date.now();
  const open = lastOhlcClose ?? randomAround(basePrice, 0.2);
  const delta = (Math.random() - 0.5) * 0.8; // biên độ ±0.4
  const close = open + delta;
  const high = Math.max(open, close) + Math.random() * 0.3;
  const low = Math.min(open, close) - Math.random() * 0.3;

  lastOhlcTimestamp = timestamp;
  lastOhlcClose = close;

  return {
    open,
    close,
    high,
    low,
  };
}

// Kết hợp với trade
export function getRandomTrade() {
  const tokenStats = getRandomTokenStats();
  return {
    tx_hash: Math.random().toString(36).substring(2, 15),
    timestamp: Date.now(),
    type: Math.random() > 0.5 ? 'BUY' : 'SELL',
    amount_token: parseFloat((Math.random() * 100).toFixed(2)),
    amount_sol: parseFloat((Math.random() * 50).toFixed(3)),
    price: tokenStats.price, // lấy từ token stats
    price_usd: tokenStats.price,
    market_cap: tokenStats.market_cap,
    trader_address: 'So' + Math.random().toString(36).substring(2, 15),
    tx_url:
      'https://solscan.io/tx/' + Math.random().toString(36).substring(2, 15),
  };
}

export function getRandomTopTrader() {
  return {
    address: 'So' + Math.random().toString(36),
    name:
      Math.random() > 0.5 ? `Trader_${Math.floor(Math.random() * 1000)}` : null,
    total_pnl: parseFloat((Math.random() * 500 - 250).toFixed(2)),
    roi_percent: parseFloat((Math.random() * 200 - 50).toFixed(2)),
    total_bought: parseFloat((Math.random() * 1000).toFixed(2)),
    total_sold: parseFloat((Math.random() * 1000).toFixed(2)),
    win_rate: parseFloat((Math.random() * 100).toFixed(2)),
    trades_count: Math.floor(Math.random() * 100),
  };
}

export function getRandomHolder() {
  const balance = parseFloat((Math.random() * 100000).toFixed(2));
  const totalBought = parseFloat((Math.random() * 100000).toFixed(2));
  const totalSold = parseFloat((Math.random() * totalBought).toFixed(2));
  const realizedPnl = parseFloat((Math.random() * 5000 - 2000).toFixed(2));
  const unrealizedPnl = parseFloat((Math.random() * 5000 - 2000).toFixed(2));

  return {
    address: 'So' + Math.random().toString(36).substring(2, 15),
    name:
      Math.random() > 0.5
        ? `Holder_${Math.floor(Math.random() * 10000)}`
        : null,
    balance,
    balance_percent: parseFloat((Math.random() * 100).toFixed(2)),
    avg_buy_price: parseFloat((Math.random() * 2).toFixed(6)),
    total_bought: totalBought,
    total_sold: totalSold,
    realized_pnl: realizedPnl,
    unrealized_pnl: unrealizedPnl,
    total_pnl: parseFloat((realizedPnl + unrealizedPnl).toFixed(2)),
    roi_percent: parseFloat((Math.random() * 200 - 50).toFixed(2)),
    first_tx_time: Date.now(),
    last_tx_time: Date.now(),
    tx_count: Math.floor(Math.random() * 200),
  };
}

function randomAround(base: number, percent = 1) {
  const factor = 1 + (Math.random() * 2 - 1) * (percent / 100);
  return parseFloat((base * factor).toFixed(2));
}

function randomChangePercent(percent = 0.1) {
  return parseFloat(((Math.random() * 2 - 1) * percent).toFixed(2)); // ±percent %
}

export function getRandomTokenStats() {
  const basePrice = 140;
  const baseMarketCap = 79_000_000_000;
  const baseLiquidity = 167_000_000;
  const baseHolders = 3_000_000;
  const baseTxs = 200_000_000;
  const baseVolume = 100_000_000;

  const timestamp = Date.now();

  const price = randomAround(basePrice);
  const priceChange24h = randomChangePercent();

  const marketCap = randomAround(baseMarketCap);
  const marketCapChange24h = randomChangePercent();

  const liquidity = randomAround(baseLiquidity);
  const liquidityChange24h = randomChangePercent();

  const holders = randomAround(baseHolders);
  const holdersChange24h = randomChangePercent();

  const txs = Math.round(randomAround(baseTxs));
  const txsChange24h = randomChangePercent();

  const volume = randomAround(baseVolume);
  const volumeChange24h = randomChangePercent();

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
    first_tx_time:
      Date.now() - Math.floor(Math.random() * 60 * 24 * 3600 * 1000),
    last_tx_time: Date.now() - Math.floor(Math.random() * 24 * 3600 * 1000),
    tx_count: Math.floor(Math.random() * 200),
  };
}

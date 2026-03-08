import { Injectable, Inject, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WalletsService } from '../../wallets/services/wallets.service';
import { SolanaService } from '../../../infra/solana/solana.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { SwapTrade } from '../entities/swap-trade.entity';

const SOL_COINGECKO_ID = 'solana';
const SOL_PRICE_CACHE_KEY = 'sol-price-usd';
const TOKEN_LIST_CACHE_KEY = 'solana-token-list';
const CACHE_TTL_SECONDS = 60 * 5; // 5 minutes

interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  logoURI: string;
  decimals: number;
  extensions?: {
    coingeckoId?: string;
  };
}

@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);
  private readonly heliusRateLimitRps = 5; // max requests per second
  private heliusRequestTimestamps: number[] = [];

  constructor(
    private readonly walletsService: WalletsService,
    private readonly solanaService: SolanaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectRepository(SwapTrade) private swapTradeRepo: Repository<SwapTrade>,
  ) {}

  private async heliusGet(url: string): Promise<any> {
    const windowMs = 1000;
    const now = Date.now();
    this.heliusRequestTimestamps = this.heliusRequestTimestamps.filter(
      (ts) => now - ts < windowMs,
    );
    if (this.heliusRequestTimestamps.length >= this.heliusRateLimitRps) {
      const oldest = this.heliusRequestTimestamps[0];
      const waitMs = windowMs - (now - oldest) + 10;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.heliusRequestTimestamps.push(Date.now());
    return axios.get(url);
  }

  private async getSolPriceUsd(): Promise<number> {
    const cachedPrice =
      await this.cacheManager.get<number>(SOL_PRICE_CACHE_KEY);
    const cachedPrice =
      await this.cacheManager.get<number>(SOL_PRICE_CACHE_KEY);
    if (cachedPrice) {
      return cachedPrice;
    }

    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price',
        {
          params: {
            ids: SOL_COINGECKO_ID,
            vs_currencies: 'usd',
          },
        },
      );
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price',
        {
          params: {
            ids: SOL_COINGECKO_ID,
            vs_currencies: 'usd',
          },
        },
      );
      const price = response.data[SOL_COINGECKO_ID]?.usd;
      if (price) {
        await this.cacheManager.set(
          SOL_PRICE_CACHE_KEY,
          price,
          CACHE_TTL_SECONDS * 1000,
        );
        await this.cacheManager.set(
          SOL_PRICE_CACHE_KEY,
          price,
          CACHE_TTL_SECONDS * 1000,
        );
        return price;
      }
      return 0;
    } catch (error) {
      console.error('Failed to fetch SOL price from CoinGecko', error);
      return 0; // Return 0 or a fallback price if the API call fails
    }
  }

  private async getSolPriceHistory(
    fromSec: number,
    toSec: number,
  ): Promise<Map<number, number>> {
    const fromDay = Math.floor(fromSec / 86400) * 86400;
    const toDay = Math.ceil(toSec / 86400) * 86400;
    const cacheKey = `sol-price-history-${fromDay}-${toDay}`;

    const cached =
      await this.cacheManager.get<Record<string, number>>(cacheKey);
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
      this.logger.log(`[getSolPriceHistory] cache hit: ${cacheKey}`);
      return new Map(Object.entries(cached).map(([k, v]) => [Number(k), v]));
    }

    this.logger.log(
      `[getSolPriceHistory] cache miss → fetching CoinGecko: ${cacheKey}`,
    );
    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/coins/solana/market_chart/range',
        {
          params: {
            vs_currency: 'usd',
            from: fromDay,
            to: toDay,
          },
        },
      );

      const priceChart = new Map<number, number>();
      for (const [tsMs, price] of response.data.prices as [number, number][]) {
        const dayTs = Math.floor(tsMs / 1000 / 86400) * 86400;
        priceChart.set(dayTs, price); // overwrites with latest price of the day
      }

      const nowSec = Date.now() / 1000;
      const ttl =
        toDay < nowSec - 86400 ? 24 * 60 * 60 * 1000 : CACHE_TTL_SECONDS * 1000;
      await this.cacheManager.set(
        cacheKey,
        Object.fromEntries(priceChart),
        ttl,
      );
      return priceChart;
    } catch (error) {
      console.error('Failed to fetch SOL price history from CoinGecko');
      return new Map();
    }
  }

  private getSolPriceNear(
    timestampSec: number,
    priceChart: Map<number, number>,
  ): number {
    const dayTs = Math.floor(timestampSec / 86400) * 86400;
    if (priceChart.has(dayTs)) return priceChart.get(dayTs)!;
    // fallback: giá mới nhất trong chart
    let latest = 0;
    for (const [ts, price] of priceChart) {
      if (ts > dayTs) break;
      latest = price;
    }
    return latest;
  }

  private async getAvgHistoricalSolPrice(
    trades: any[],
    fallback: number,
  ): Promise<number> {
    if (trades.length === 0) return fallback;
    const timestamps = trades.map((t) => t.timestamp as number);
    const minTs = Math.min(...timestamps);
    const maxTs = Math.max(...timestamps);
    const priceChart = await this.getSolPriceHistory(minTs, maxTs);
    if (priceChart.size === 0) return fallback;
    const prices = Array.from(priceChart.values());
    return prices.reduce((a, b) => a + b, 0) / prices.length;
  }

  private async getTokenList(): Promise<Map<string, TokenInfo>> {
    const cachedList =
      await this.cacheManager.get<Record<string, TokenInfo>>(
        TOKEN_LIST_CACHE_KEY,
      );
    if (
      cachedList &&
      typeof cachedList === 'object' &&
      !Array.isArray(cachedList)
    ) {
      return new Map(Object.entries(cachedList));
    }

    try {
      const response = await axios.get(
        'https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json',
      );
      const response = await axios.get(
        'https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json',
      );
      const tokenList = response.data.tokens as TokenInfo[];
      const tokenMap = new Map(
        tokenList.map((token) => [token.address, token]),
      );
      await this.cacheManager.set(
        TOKEN_LIST_CACHE_KEY,
        Object.fromEntries(tokenMap),
        CACHE_TTL_SECONDS * 1000,
      );
      return tokenMap;
    } catch (error) {
      console.error('Failed to fetch Solana token list', error);
      return new Map();
    }
  }

  private async getTokenPrices(
    mintAddresses: string[],
    tokenMetaMap: Map<string, TokenInfo>,
  ): Promise<Map<string, number>> {
    if (mintAddresses.length === 0) {
      return new Map();
    }

    const coingeckoIdToMintMap = new Map<string, string>();
    const coingeckoIds: string[] = [];

    for (const mint of mintAddresses) {
      const coingeckoId = tokenMetaMap.get(mint)?.extensions?.coingeckoId;
      if (coingeckoId) {
        coingeckoIds.push(coingeckoId);
        coingeckoIdToMintMap.set(coingeckoId, mint);
      }
    }

    if (coingeckoIds.length === 0) {
      return new Map();
    }

    const cacheKey = `token-prices-${[...coingeckoIds].sort().join(',')}`;
    const cached =
      await this.cacheManager.get<Record<string, number>>(cacheKey);
    if (cached && typeof cached === 'object' && !Array.isArray(cached)) {
      return new Map(Object.entries(cached));
    }

    try {
      const response = await axios.get(
        'https://api.coingecko.com/api/v3/simple/price',
        {
          params: {
            ids: coingeckoIds.join(','),
            vs_currencies: 'usd',
          },
        },
      );
      const prices = response.data;
      const priceMap = new Map<string, number>();

      for (const coingeckoId in prices) {
        if (prices[coingeckoId]?.usd) {
          const mint = coingeckoIdToMintMap.get(coingeckoId);
          if (mint) {
            priceMap.set(mint, prices[coingeckoId].usd);
          }
        }
      }
      await this.cacheManager.set(
        cacheKey,
        Object.fromEntries(priceMap),
        CACHE_TTL_SECONDS * 1000,
      );
      return priceMap;
    } catch (error) {
      console.error('Failed to fetch token prices from CoinGecko', error);
      return new Map();
    }
  }

  async getOverview(
    userId: string,
    walletAddresses?: string[],
    timeFrame?: string,
  ) {
  async getOverview(
    userId: string,
    walletAddresses?: string[],
    timeFrame?: string,
  ) {
    let wallets = await this.walletsService.findByUserId(userId);

    if (walletAddresses && walletAddresses.length > 0) {
      wallets = wallets.filter((w) => walletAddresses.includes(w.address));
      wallets = wallets.filter((w) => walletAddresses.includes(w.address));
    }

    const [solPrice, tokenMetaMap] = await Promise.all([
      this.getSolPriceUsd(),
      this.getTokenList(),
    ]);

    const total_balance_sol = wallets.reduce(
      (acc, w) => acc + Number(w.balance || 0),
      0,
    );
    const total_balance_sol = wallets.reduce(
      (acc, w) => acc + Number(w.balance || 0),
      0,
    );
    let total_balance_usd = total_balance_sol * solPrice;

    const allTokenAccounts = (
      await Promise.all(
        wallets.map((w) =>
          this.solanaService.getParsedTokenAccountsByOwner(
            new PublicKey(w.address),
            true,
          ),
        ),
      )
    ).flat();
    const allTokenAccounts = (
      await Promise.all(
        wallets.map((w) =>
          this.solanaService.getParsedTokenAccountsByOwner(
            new PublicKey(w.address),
            true,
          ),
        ),
      )
    ).flat();

    const aggregatedTokens = new Map<
      string,
      { amount: number; info?: TokenInfo }
    >();
    const aggregatedTokens = new Map<
      string,
      { amount: number; info?: TokenInfo }
    >();

    for (const acc of allTokenAccounts) {
      const mint = acc.account.data.parsed.info.mint;
      const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
      if (amount > 0) {
        const existing = aggregatedTokens.get(mint) || { amount: 0 };
        aggregatedTokens.set(mint, {
          amount: existing.amount + amount,
          info: tokenMetaMap.get(mint),
        });
      }
    }

    const tokenPrices = await this.getTokenPrices(
      Array.from(aggregatedTokens.keys()),
      tokenMetaMap,
    );

    const positions = Array.from(aggregatedTokens.entries()).map(
      ([mint, data]) => {
        const price = tokenPrices.get(mint) || 0;
        const valueUsd = data.amount * price;
        return {
          mint,
          ...data.info,
          amount: data.amount,
          price,
          valueUsd,
        };
      },
    );
    const positions = Array.from(aggregatedTokens.entries()).map(
      ([mint, data]) => {
        const price = tokenPrices.get(mint) || 0;
        const valueUsd = data.amount * price;
        return {
          mint,
          ...data.info,
          amount: data.amount,
          price,
          valueUsd,
        };
      },
    );

    positions.forEach((p) => (total_balance_usd += p.valueUsd));
    positions.forEach((p) => (total_balance_usd += p.valueUsd));

    positions.sort((a, b) => b.valueUsd - a.valueUsd);

    const top_tokens = positions.slice(0, 5).map((p) => ({
    const top_tokens = positions.slice(0, 5).map((p) => ({
      name: p.name || 'Unknown',
      symbol: p.symbol || '???',
      logo: p.logoURI || '',
      value_usd: p.valueUsd,
      price: p.price,
      change_24h: 0, // Placeholder
    }));

    const allocation = positions.map((p) => ({
    const allocation = positions.map((p) => ({
      name: p.name || 'Unknown',
      symbol: p.symbol || '???',
      value_usd: p.valueUsd,
      percentage:
        total_balance_usd > 0 ? (p.valueUsd / total_balance_usd) * 100 : 0,
      percentage:
        total_balance_usd > 0 ? (p.valueUsd / total_balance_usd) * 100 : 0,
    }));

    // Add SOL to allocation
    const solValueUsd = total_balance_sol * solPrice;
    if (solValueUsd > 0) {
      allocation.push({
        name: 'Solana',
        symbol: 'SOL',
        value_usd: solValueUsd,
        percentage:
          total_balance_usd > 0 ? (solValueUsd / total_balance_usd) * 100 : 0,
        percentage:
          total_balance_usd > 0 ? (solValueUsd / total_balance_usd) * 100 : 0,
      });
    }
    allocation.sort((a, b) => b.value_usd - a.value_usd);

    const heliusApiKey = this.solanaService.getHeliusApiKey();
    if (!heliusApiKey) {
      // If no API key, we can't fetch transaction stats.
      // Return with zeroed-out transaction data.
      return {
        total_balance_usd,
        total_balance_sol,
        balance_change_24h: 0,
        pnl: {
          total: 0,
          realized: 0,
          unrealized: 0,
          change_24h: 0,
          roi_percent: 0,
        },
        transactions: {
          total: 0,
          buys: 0,
          sells: 0,
          transfers: 0,
          last_24h: 0,
        },
        pnl: {
          total: 0,
          realized: 0,
          unrealized: 0,
          change_24h: 0,
          roi_percent: 0,
        },
        transactions: {
          total: 0,
          buys: 0,
          sells: 0,
          transfers: 0,
          last_24h: 0,
        },
        top_tokens,
        allocation,
      };
    }

    const [transactionStats, trades] = await Promise.all([
      this.getTransactionStats(wallets, heliusApiKey),
      this.fetchAllTrades(wallets, heliusApiKey),
    ]);

    const pnlMap = this.calculatePnl(trades);

    const avgHistoricalSolPrice = await this.getAvgHistoricalSolPrice(
      trades,
      solPrice,
    );

    const realized_usd = Array.from(pnlMap.values()).reduce(
      (acc, r) => acc + r.pnl * avgHistoricalSolPrice,
      0,
    );

    const unrealized_usd = Array.from(pnlMap.entries()).reduce(
      (acc, [mint, r]) => {
        if (r.totalTokensBought <= 0) return acc;
        const currentPrice = tokenPrices.get(mint) || 0;
        const currentValue = r.totalTokensBought * currentPrice;
        const costBasisUsd = r.totalSolSpent * solPrice;
        return acc + (currentValue - costBasisUsd);
      },
      0,
    );

    const total_pnl = realized_usd + unrealized_usd;
    const total_investment_usd = Array.from(pnlMap.values()).reduce(
      (acc, r) => acc + r.investment * solPrice,
      0,
    );
    const roi_percent =
      total_investment_usd > 0 ? (total_pnl / total_investment_usd) * 100 : 0;

    return {
      total_balance_usd,
      total_balance_sol,
      balance_change_24h: 0,
      pnl: {
        total: total_pnl,
        realized: realized_usd,
        unrealized: unrealized_usd,
        change_24h: 0,
        roi_percent,
      },
      transactions: transactionStats,
      top_tokens,
      allocation,
    };
  }

  async getPnlChart(
    userId: string,
    walletAddresses: string[],
    timeFrame: string,
    interval: string,
  ) {
  async getPnlChart(
    userId: string,
    walletAddresses: string[],
    timeFrame: string,
    interval: string,
  ) {
    const now = Date.now();
    let startTime = now;
    let intervalMs = 24 * 60 * 60 * 1000;

    switch (timeFrame) {
      case '7d':
        startTime = now - 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        startTime = now - 30 * 24 * 60 * 60 * 1000;
        break;
      case '90d':
        startTime = now - 90 * 24 * 60 * 60 * 1000;
        break;
      case '1y':
        startTime = now - 365 * 24 * 60 * 60 * 1000;
        break;
      case 'all':
        startTime = now - 2 * 365 * 24 * 60 * 60 * 1000;
        break;
      default:
        startTime = now - 7 * 24 * 60 * 60 * 1000;
    }

    switch (interval) {
      case '1h':
        intervalMs = 60 * 60 * 1000;
        break;
      case '1d':
        intervalMs = 24 * 60 * 60 * 1000;
        break;
      case '1w':
        intervalMs = 7 * 24 * 60 * 60 * 1000;
        break;
    }

    const heliusApiKey = this.solanaService.getHeliusApiKey();
    if (!heliusApiKey) {
      return { chart_data: [] };
    }

    let wallets = await this.walletsService.findByUserId(userId);
    if (walletAddresses && walletAddresses.length > 0) {
      wallets = wallets.filter((w) => walletAddresses.includes(w.address));
    }
    if (wallets.length === 0) {
      return { chart_data: [] };
    }

    const TWO_YEARS_SEC = 2 * 365 * 24 * 60 * 60;
    const cutoffSec = Math.floor(now / 1000) - TWO_YEARS_SEC;
    const startTimeSec = Math.floor(startTime / 1000);

    // Ensure each wallet has data in DB; if empty, trigger a sync via fetchWalletActivities
    for (const wallet of wallets) {
      const count = await this.swapTradeRepo.count({
        where: { walletAddress: wallet.address },
      });
      if (count === 0) {
        await this.fetchWalletActivities(
          wallet.address,
          'all',
          100,
          heliusApiKey,
        );
      }
    }

    // Read swaps directly from DB, filtered to timeframe
    const dbTrades = await this.swapTradeRepo
      .createQueryBuilder('st')
      .where('st.walletAddress IN (:...addrs)', {
        addrs: wallets.map((w) => w.address),
      })
      .andWhere('st.timestamp >= :start', { start: startTimeSec })
      .andWhere('st.timestamp >= :cutoff', { cutoff: cutoffSec })
      .orderBy('st.timestamp', 'ASC')
      .getMany();

    const filteredTrades = dbTrades.map((row) => ({
      signature: row.signature,
      timestamp: Number(row.timestamp),
      type: row.type,
      tokenTransfers: row.tokenTransfers,
      description: row.description,
    }));
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    // Fetch historical SOL prices for the chart range
    const historyFrom =
      filteredTrades.length > 0 ? filteredTrades[0].timestamp : startTimeSec;
    const historyTo = Math.floor(now / 1000);
    const solPriceChart = await this.getSolPriceHistory(historyFrom, historyTo);

    // Single-pass: track cumulative realized PnL per interval using average cost basis
    const runningHoldings = new Map<
      string,
      { totalTokensBought: number; totalSolSpent: number }
    >();
    let cumulativePnlSol = 0;
    let tradeIndex = 0;

    const chartData: { timestamp: number; pnl: number; balance_usd: number }[] =
      [];

    for (let time = startTime; time <= now; time += intervalMs) {
      const timeSec = Math.floor(time / 1000);
      while (
        tradeIndex < filteredTrades.length &&
        filteredTrades[tradeIndex].timestamp <= timeSec
      ) {
        const trade = filteredTrades[tradeIndex++];
        if (trade.type !== 'SWAP') continue;

        const tokenOut = (trade.tokenTransfers ?? []).find(
          (t: any) => t.fromUserAccount,
        );
        const tokenIn = (trade.tokenTransfers ?? []).find(
          (t: any) => t.toUserAccount,
        );
        if (!tokenOut || !tokenIn) continue;

        const isBuy = tokenIn.mint !== SOL_MINT;
        const tokenMint = isBuy ? tokenIn.mint : tokenOut.mint;
        const solAmount = isBuy ? tokenOut.tokenAmount : tokenIn.tokenAmount;
        const tokenAmount = isBuy ? tokenIn.tokenAmount : tokenOut.tokenAmount;

        console.log('DEBUG', isBuy, tokenMint, solAmount, tokenAmount);
        if (!tokenMint || !solAmount || !tokenAmount) continue;

        const holding = runningHoldings.get(tokenMint) ?? {
          totalTokensBought: 0,
          totalSolSpent: 0,
        };

        if (isBuy) {
          holding.totalTokensBought += tokenAmount;
          holding.totalSolSpent += solAmount;
        } else {
          // Cost basis = 0 nếu không có buy được track (airdrop, buy trước 2 năm, v.v.)
          const avgCost =
            holding.totalTokensBought > 0
              ? holding.totalSolSpent / holding.totalTokensBought
              : 0;
          const costOfGoodsSold = tokenAmount * avgCost;
          cumulativePnlSol += solAmount - costOfGoodsSold;
          holding.totalTokensBought = Math.max(
            0,
            holding.totalTokensBought - tokenAmount,
          );
          holding.totalSolSpent = Math.max(
            0,
            holding.totalSolSpent - costOfGoodsSold,
          );
        }
        runningHoldings.set(tokenMint, holding);
      }

      const solPriceAtTime = this.getSolPriceNear(timeSec, solPriceChart);
      const pnlUsd = cumulativePnlSol * solPriceAtTime;
      console.log('f', solPriceAtTime, cumulativePnlSol, pnlUsd);
      chartData.push({ timestamp: time, pnl: pnlUsd, balance_usd: pnlUsd });
    }

    return { chart_data: chartData };
  }

  async getPositions(
    userId: string,
    walletAddress?: string,
    sortBy: string = 'value_usd',
    showZeroBalance: boolean = false,
  ) {
  async getPositions(
    userId: string,
    walletAddress?: string,
    sortBy: string = 'value_usd',
    showZeroBalance: boolean = false,
  ) {
    const wallets = await this.walletsService.findByUserId(userId);
    const targetWallets = walletAddress
      ? wallets.filter((w) => w.address === walletAddress)
      : wallets;
    const targetWallets = walletAddress
      ? wallets.filter((w) => w.address === walletAddress)
      : wallets;

    if (targetWallets.length === 0) {
      return {
        positions: [],
        summary: { total_value_usd: 0, total_tokens: 0, total_pnl: 0 },
      };
      return {
        positions: [],
        summary: { total_value_usd: 0, total_tokens: 0, total_pnl: 0 },
      };
    }

    const [solPrice, tokenMetaMap] = await Promise.all([
      this.getSolPriceUsd(),
      this.getTokenList(),
    ]);

    const allTokenAccounts = (
      await Promise.all(
        targetWallets.map((w) =>
          this.solanaService.getParsedTokenAccountsByOwner(
            new PublicKey(w.address),
          ),
        ),
      )
    ).flat();
    const allTokenAccounts = (
      await Promise.all(
        targetWallets.map((w) =>
          this.solanaService.getParsedTokenAccountsByOwner(
            new PublicKey(w.address),
          ),
        ),
      )
    ).flat();

    const aggregatedTokens = new Map<
      string,
      { amount: number; info?: TokenInfo }
    >();
    const aggregatedTokens = new Map<
      string,
      { amount: number; info?: TokenInfo }
    >();

    for (const acc of allTokenAccounts) {
      const mint = acc.account.data.parsed.info.mint;
      const amount = acc.account.data.parsed.info.tokenAmount.uiAmount;
      if (amount > 0 || showZeroBalance) {
        const existing = aggregatedTokens.get(mint) || { amount: 0 };
        aggregatedTokens.set(mint, {
          amount: existing.amount + amount,
          info: tokenMetaMap.get(mint),
        });
      }
    }

    const tokenPrices = await this.getTokenPrices(
      Array.from(aggregatedTokens.keys()),
      tokenMetaMap,
    );

    let positions = Array.from(aggregatedTokens.entries()).map(
      ([mint, data]) => {
        const price = tokenPrices.get(mint) || 0;
        const valueUsd = data.amount * price;
        return {
          mint,
          name: data.info?.name || 'Unknown Token',
          symbol: data.info?.symbol || '???',
          logo: data.info?.logoURI || '',
          amount: data.amount,
          price,
          value_usd: valueUsd,
          pnl: 0, // Placeholder
          pnl_percent: 0, // Placeholder
        };
      },
    );

    const totalSolBalance = targetWallets.reduce(
      (acc, w) => acc + Number(w.balance || 0),
      0,
    );
    const totalSolBalance = targetWallets.reduce(
      (acc, w) => acc + Number(w.balance || 0),
      0,
    );
    const solValueUsd = totalSolBalance * solPrice;

    // Add SOL as a position
    if (totalSolBalance > 0 || showZeroBalance) {
      positions.push({
        mint: 'So11111111111111111111111111111111111111112', // Native SOL mint address
        name: 'Solana',
        symbol: 'SOL',
        logo:
          tokenMetaMap.get('So11111111111111111111111111111111111111112')
            ?.logoURI || '',
        logo:
          tokenMetaMap.get('So11111111111111111111111111111111111111112')
            ?.logoURI || '',
        amount: totalSolBalance,
        price: solPrice,
        value_usd: solValueUsd,
        pnl: 0, // Placeholder
        pnl_percent: 0, // Placeholder
      });
    }

    // Sorting
    switch (sortBy) {
      case 'amount':
        positions.sort((a, b) => b.amount - a.amount);
        break;
      case 'name':
        positions.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case 'value_usd':
      default:
        positions.sort((a, b) => b.value_usd - a.value_usd);
        break;
    }

    const total_value_usd = positions.reduce((acc, p) => acc + p.value_usd, 0);

    return {
      positions,
      summary: {
        total_value_usd,
        total_tokens: positions.length,
        total_pnl: 0, // Placeholder
      },
    };
  }

  private async fetchWalletActivities(
    walletAddress: string,
    type: string,
    limit: number,
    heliusApiKey: string,
    before?: string,
  ) {
    let heliusType = '';
    if (type === 'buy' || type === 'sell') {
      heliusType = 'SWAP';
    } else if (type === 'transfer') {
      heliusType = 'TRANSFER';
    }

    const heliusBaseUrl = this.solanaService.getHeliusBaseUrl();
    let url = `${heliusBaseUrl}/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=${limit}`;
    if (heliusType) url += `&type=${heliusType}`;
    if (before) url += `&before=${before}`;

    try {
      const response = await this.heliusGet(url);
      let transactions = response.data as any[];

      // Save detected swaps to DB so PnL can use them
      const swapsToSave = transactions.filter((tx) =>
        this.isSwap(tx, walletAddress),
      );
      if (swapsToSave.length > 0) {
        const entities = swapsToSave.map((tx) =>
          this.swapTradeRepo.create({
            walletAddress,
            signature: tx.signature,
            timestamp: tx.timestamp,
            tokenTransfers: [
              ...(tx.tokenTransfers ?? []),
              ...(tx.nativeTransfers ?? []).map((nt: any) => ({
                fromUserAccount: nt.fromUserAccount,
                toUserAccount: nt.toUserAccount,
                mint: 'So11111111111111111111111111111111111111112',
                tokenAmount: nt.amount / 1e9,
              })),
            ],
            description: tx.description ?? null,
            type: 'SWAP',
          }),
        );
        try {
          await this.swapTradeRepo
            .createQueryBuilder()
            .insert()
            .into(SwapTrade)
            .values(entities)
            .orIgnore()
            .execute();
        } catch {
          /* ignore */
        }
      }

      if (type === 'buy') {
        transactions = transactions.filter((tx) => {
        transactions = transactions.filter((tx) => {
          if (tx.type !== 'SWAP') return false;
          return !tx.tokenTransfers.find(
            (t) => t.fromUserAccount === walletAddress,
          );
        });
      } else if (type === 'sell') {
        transactions = transactions.filter((tx) => {
        transactions = transactions.filter((tx) => {
          if (tx.type !== 'SWAP') return false;
          return !!tx.tokenTransfers.find(
            (t) => t.fromUserAccount === walletAddress,
          );
        });
      }

      return transactions;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return [];
      }
      console.error(`Failed to fetch activities for ${walletAddress}`);
      return [];
    }
  }

  private formatSourceName(source: string): string {
    if (!source || source === 'UNKNOWN') return 'Unknown';
    return source.charAt(0) + source.slice(1).toLowerCase().replace(/_/g, ' ');
  }

  private mapToActivity(
    tx: any,
    walletAddress: string,
    solPrice: number,
    tokenMetaMap: Map<string, TokenInfo>,
  ) {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const network = this.solanaService.getNetwork();

    const feeSol = tx.fee ? tx.fee / LAMPORTS_PER_SOL : 0;
    const feeUsd = feeSol * solPrice;

    const txUrl =
      network === 'devnet'
        ? `https://solscan.io/tx/${tx.signature}?cluster=devnet`
        : `https://solscan.io/tx/${tx.signature}`;

    const app = {
      name: this.formatSourceName(tx.source),
      type: tx.type === 'SWAP' ? 'DEX' : 'PROGRAM',
      icon: '',
    };

    const status: 'success' | 'failed' = tx.transactionError
      ? 'failed'
      : 'success';

    const tags: string[] = [tx.type].filter(Boolean);
    if (tx.source && tx.source !== 'UNKNOWN') tags.push(tx.source);

    const getSymbol = (mint: string) => {
      if (mint === SOL_MINT) return 'SOL';
      return tokenMetaMap.get(mint)?.symbol ?? mint.slice(0, 8);
    };

    let type: string = tx.type;
    let token_in: any;
    let token_out: any;
    let token: any;
    let from: string | undefined;
    let to: string | undefined;

    if (tx.type === 'SWAP') {
      const swapEvent = tx.events?.swap;
      if (swapEvent) {
        if (swapEvent.nativeInput) {
          const amount = swapEvent.nativeInput.amount / LAMPORTS_PER_SOL;
          token_in = {
            address: SOL_MINT,
            symbol: 'SOL',
            amount,
            value_usd: amount * solPrice,
          };
        } else if (swapEvent.tokenInputs?.[0]) {
          const inp = swapEvent.tokenInputs[0];
          const amount = parseFloat(inp.rawTokenAmount?.tokenAmount ?? '0');
          token_in = {
            address: inp.mint,
            symbol: getSymbol(inp.mint),
            amount,
            value_usd: 0,
          };
        }

        if (swapEvent.nativeOutput) {
          const amount = swapEvent.nativeOutput.amount / LAMPORTS_PER_SOL;
          token_out = {
            address: SOL_MINT,
            symbol: 'SOL',
            amount,
            value_usd: amount * solPrice,
          };
        } else if (swapEvent.tokenOutputs?.[0]) {
          const out = swapEvent.tokenOutputs[0];
          const amount = parseFloat(out.rawTokenAmount?.tokenAmount ?? '0');
          token_out = {
            address: out.mint,
            symbol: getSymbol(out.mint),
            amount,
            value_usd: 0,
          };
        }
      } else {
        const sold = (tx.tokenTransfers ?? []).find(
          (t: any) => t.fromUserAccount === walletAddress,
        );
        const bought = (tx.tokenTransfers ?? []).find(
          (t: any) => t.toUserAccount === walletAddress,
        );
        if (sold)
          token_in = {
            address: sold.mint,
            symbol: getSymbol(sold.mint),
            amount: sold.tokenAmount,
            value_usd: 0,
          };
        if (bought)
          token_out = {
            address: bought.mint,
            symbol: getSymbol(bought.mint),
            amount: bought.tokenAmount,
            value_usd: 0,
          };
      }
    } else if (tx.type === 'TRANSFER') {
      const tokenTransfer = (tx.tokenTransfers ?? [])[0];
      const nativeTransfer = (tx.nativeTransfers ?? [])[0];
      const xfer = tokenTransfer ?? nativeTransfer;
      if (xfer) {
        from = xfer.fromUserAccount;
        to = xfer.toUserAccount;
        type =
          xfer.toUserAccount === walletAddress ? 'TRANSFER_IN' : 'TRANSFER_OUT';
        if (tokenTransfer) {
          token = {
            address: tokenTransfer.mint,
            symbol: getSymbol(tokenTransfer.mint),
            amount: tokenTransfer.tokenAmount,
            value_usd: 0,
          };
        } else {
          const amount = nativeTransfer.amount / LAMPORTS_PER_SOL;
          token = {
            address: SOL_MINT,
            symbol: 'SOL',
            amount,
            value_usd: amount * solPrice,
          };
        }
      }
    } else if (tx.type === 'STAKE_SOL' || tx.type === 'STAKE') {
      type = 'STAKE';
      const nativeTransfer = (tx.nativeTransfers ?? [])[0];
      if (nativeTransfer) {
        const amount = nativeTransfer.amount / LAMPORTS_PER_SOL;
        token = {
          address: SOL_MINT,
          symbol: 'SOL',
          amount,
          value_usd: amount * solPrice,
        };
      }
    } else if (tx.type === 'UNSTAKE_SOL' || tx.type === 'UNSTAKE') {
      type = 'UNSTAKE';
      const nativeTransfer = (tx.nativeTransfers ?? [])[0];
      if (nativeTransfer) {
        const amount = nativeTransfer.amount / LAMPORTS_PER_SOL;
        token = {
          address: SOL_MINT,
          symbol: 'SOL',
          amount,
          value_usd: amount * solPrice,
        };
      }
    }

    return {
      tx_hash: tx.signature,
      type,
      timestamp: tx.timestamp,
      status,
      app,
      ...(token_in && { token_in }),
      ...(token_out && { token_out }),
      ...(token && { token }),
      ...(from && { from }),
      ...(to && { to }),
      wallet: walletAddress,
      wallet_icon: '',
      tags,
      fee_sol: feeSol,
      fee_usd: feeUsd,
      tx_url: txUrl,
    };
  }

  async getActivities(
    userId: string,
    walletAddress?: string,
    type: string = 'all',
    limit: number = 20,
    before?: string,
  ) {
    const heliusApiKey = this.solanaService.getHeliusApiKey();
    if (!heliusApiKey) {
      console.error('Helius API Key is not configured.');
      return {
        activities: [],
        total: 0,
        summary: { total_volume_usd: 0, total_fees_usd: 0 },
      };
    }

    const [userWallets, solPrice, tokenMetaMap] = await Promise.all([
      this.walletsService.findByUserId(userId),
      this.getSolPriceUsd(),
      this.getTokenList(),
    ]);

    let targetAddresses: string[];
    if (walletAddress) {
      const owned = userWallets.find((w) => w.address === walletAddress);
      if (!owned)
        return {
          activities: [],
          total: 0,
          summary: { total_volume_usd: 0, total_fees_usd: 0 },
        };
      targetAddresses = [walletAddress];
    } else {
      if (userWallets.length === 0)
        return {
          activities: [],
          total: 0,
          summary: { total_volume_usd: 0, total_fees_usd: 0 },
        };
      targetAddresses = userWallets.map((w) => w.address);
    }

    const results = await Promise.all(
      targetAddresses.map(async (addr) => {
        const txs = await this.fetchWalletActivities(
          addr,
          type,
          limit,
          heliusApiKey,
          walletAddress ? before : undefined,
        );
        return txs.map((tx: any) => ({ tx, addr }));
      }),
    );

    // Sort by timestamp desc and slice
    const flat = results.flat();
    flat.sort((a, b) => (b.tx.timestamp ?? 0) - (a.tx.timestamp ?? 0));
    const sliced = flat.slice(0, limit);

    const activities = sliced.map(({ tx, addr }) =>
      this.mapToActivity(tx, addr, solPrice, tokenMetaMap),
    );

    const total_fees_usd = activities.reduce((acc, a) => acc + a.fee_usd, 0);

    return {
      activities,
      total: activities.length,
      summary: {
        total_volume_usd: 0,
        total_fees_usd,
      },
    };
  }

  async getPerformance(
    userId: string,
    walletAddresses: string[],
    timeFrame: string, // TODO: filter fetchAllTrades by timeFrame (currently fetches last 100 per wallet)
  ) {
    const heliusApiKey = this.solanaService.getHeliusApiKey();
    if (!heliusApiKey) {
      return this.getEmptyPerformance();
    }

    let wallets = await this.walletsService.findByUserId(userId);
    if (walletAddresses && walletAddresses.length > 0) {
      wallets = wallets.filter((w) => walletAddresses.includes(w.address));
    }
    if (wallets.length === 0) {
      return this.getEmptyPerformance();
    }

    const [trades, solPrice] = await Promise.all([
      this.fetchAllTrades(wallets, heliusApiKey),
      this.getSolPriceUsd(),
    ]);

    const pnlMap = this.calculatePnl(trades);

    if (pnlMap.size === 0) {
      return this.getEmptyPerformance();
    }

    // Use avg historical SOL price over the trade period for realized PnL USD conversion
    const avgHistoricalSolPrice = await this.getAvgHistoricalSolPrice(
      trades,
      solPrice,
    );

    const tokenPerformance = Array.from(pnlMap.values()).map((record) => {
      const pnl = record.pnl * avgHistoricalSolPrice;
      const investmentUsd = record.investment * solPrice;
      const roi_percent = investmentUsd > 0 ? (pnl / investmentUsd) * 100 : 0;
      return {
        token: record.symbol,
        symbol: record.symbol,
        pnl,
        roi_percent,
      };
    });

    tokenPerformance.sort((a, b) => b.pnl - a.pnl);

    const top_performers = tokenPerformance.slice(0, 3);
    const worst_performers = tokenPerformance.slice(-3).reverse();

    const total_pnl = tokenPerformance.reduce((acc, t) => acc + t.pnl, 0);
    const total_investment_usd = Array.from(pnlMap.values()).reduce(
      (acc, r) => acc + r.investment * solPrice,
      0,
    );
    const total_roi_percent =
      total_investment_usd > 0 ? (total_pnl / total_investment_usd) * 100 : 0;

    const winning_trades = tokenPerformance.filter((t) => t.pnl > 0).length;
    const win_rate =
      tokenPerformance.length > 0
        ? (winning_trades / tokenPerformance.length) * 100
        : 0;

    const best_trade = top_performers[0] || {
      token: '',
      pnl: 0,
      roi_percent: 0,
    };
    const worst_trade = worst_performers[0] || {
      token: '',
      pnl: 0,
      roi_percent: 0,
    };

    return {
      performance: {
        total_pnl,
        total_roi_percent,
        win_rate,
        best_trade: {
          token: best_trade.token,
          pnl: best_trade.pnl,
          roi_percent: best_trade.roi_percent,
        },
        worst_trade: {
          token: worst_trade.token,
          pnl: worst_trade.pnl,
          roi_percent: worst_trade.roi_percent,
        },
      },
      top_performers,
      worst_performers,
    };
  }

  private getEmptyPerformance() {
    return {
      performance: {
        total_pnl: 0,
        total_roi_percent: 0,
        win_rate: 0,
        best_trade: { token: '', pnl: 0, roi_percent: 0 },
        worst_trade: { token: '', pnl: 0, roi_percent: 0 },
      },
      top_performers: [],
      worst_performers: [],
    };
  }

  private isSwap(tx: any, walletAddress: string): boolean {
    if (tx.type === 'SWAP' || tx.type === 'TRANSFER') return true;
    if (tx.events?.swap) return true;
    const transfers: any[] = tx.tokenTransfers ?? [];
    const sent = transfers.find((t) => t.fromUserAccount === walletAddress);
    const received = transfers.find((t) => t.toUserAccount === walletAddress);
    return !!(sent && received && sent.mint !== received.mint);
  }

  private async fetchAllTrades(wallets: any[], apiKey: string): Promise<any[]> {
    const HELIUS_CACHE_TTL = 2 * 60 * 1000;
    const TWO_YEARS_SEC = 2 * 365 * 24 * 60 * 60;
    const cutoffSec = Math.floor(Date.now() / 1000) - TWO_YEARS_SEC;
    let allSwaps: any[] = [];

    for (const wallet of wallets) {
      const cacheKey = `helius-swaps-${wallet.address}`;

      // L1: Redis cache
      // const cached = await this.cacheManager.get<any[]>(cacheKey);
      // if (cached && Array.isArray(cached)) {
      //   this.logger.log(
      //     `[fetchAllTrades] cache hit: ${wallet.address} (${cached.length} swaps)`,
      //   );
      //   allSwaps = allSwaps.concat(cached);
      //   continue;
      // }

      // L2: DB — get known signatures for this wallet
      const knownRows = await this.swapTradeRepo.find({
        where: { walletAddress: wallet.address },
        select: ['signature'],
      });
      const knownSigs = new Set(knownRows.map((r) => r.signature));

      // Paginate via fetchWalletActivities (DB save handled inside)
      const MAX_PAGES_PER_WALLET = 20; // max 2000 trades per wallet per sync
      let beforeSig: string | undefined = undefined;
      let done = false;
      let pages = 0;

      while (!done && pages < MAX_PAGES_PER_WALLET) {
        pages++;
        const page = await this.fetchWalletActivities(
          wallet.address,
          'all',
          100,
          apiKey,
          beforeSig,
        );

        if (!page || page.length === 0) {
          done = true;
          break;
        }

        for (const tx of page) {
          if (knownSigs.has(tx.signature)) {
            done = true;
            break;
          }
          if (tx.timestamp < cutoffSec) {
            done = true;
            break;
          }
        }

        if (!done) {
          beforeSig = page[page.length - 1].signature;
        }
      }

      // Load all trades from DB for this wallet within 2 years
      const dbTrades = await this.swapTradeRepo
        .createQueryBuilder('st')
        .where('st.walletAddress = :addr', { addr: wallet.address })
        .andWhere('st.timestamp >= :cutoff', { cutoff: cutoffSec })
        .orderBy('st.timestamp', 'DESC')
        .getMany();

      const walletSwaps = dbTrades.map((row) => ({
        signature: row.signature,
        timestamp: Number(row.timestamp),
        type: row.type,
        tokenTransfers: row.tokenTransfers,
        description: row.description,
      }));

      this.logger.log(
        `[fetchAllTrades] DB total: ${walletSwaps.length} swaps for ${wallet.address}`,
      );
      await this.cacheManager.set(cacheKey, walletSwaps, HELIUS_CACHE_TTL);
      allSwaps = allSwaps.concat(walletSwaps);
    }

    return allSwaps;
  }

  private calculatePnl(trades: any[]): Map<
    string,
    {
      token: string;
      symbol: string;
      pnl: number;
      investment: number;
      totalTokensBought: number;
      totalSolSpent: number;
    }
  > {
    const pnlMap = new Map<
      string,
      {
        token: string;
        symbol: string;
        pnl: number;
        investment: number;
        totalTokensBought: number;
        totalSolSpent: number;
      }
    >();

    // Sort trades by time to process them chronologically
    const sortedTrades = trades.sort((a, b) => a.timestamp - b.timestamp);

    for (const trade of sortedTrades) {
      if (trade.type !== 'SWAP') continue;

      const tokenOut = trade.tokenTransfers.find((t) => t.fromUserAccount);
      const tokenIn = trade.tokenTransfers.find((t) => t.toUserAccount);
      const tokenOut = trade.tokenTransfers.find((t) => t.fromUserAccount);
      const tokenIn = trade.tokenTransfers.find((t) => t.toUserAccount);
      const description = trade.description;

      if (!tokenOut || !tokenIn || !description) continue;

      // Extract symbol from description like "Swapped 2.02 SOL for 2,234.18 WIF"
      const symbolMatch = description.match(/for [\d,.]+ (\w+)/);
      const tradeSymbol = symbolMatch ? symbolMatch[1] : '?';

      const isBuy =
        tokenIn.mint !== 'So11111111111111111111111111111111111111112';
      const isBuy =
        tokenIn.mint !== 'So11111111111111111111111111111111111111112';
      const tokenMint = isBuy ? tokenIn.mint : tokenOut.mint;
      const solAmount = isBuy ? tokenOut.tokenAmount : tokenIn.tokenAmount;
      const tokenAmount = isBuy ? tokenIn.tokenAmount : tokenOut.tokenAmount;

      if (!tokenMint || !solAmount || !tokenAmount) continue;

      let record = pnlMap.get(tokenMint);
      if (!record) {
        record = {
          token: tokenMint,
          symbol: tradeSymbol,
          pnl: 0,
          investment: 0,
          totalTokensBought: 0,
          totalSolSpent: 0,
        };
      }
      // Always update symbol in case the first transaction was a sell
      if (record.symbol === '?') {
        record.symbol = tradeSymbol;
      }

      if (isBuy) {
        record.totalTokensBought += tokenAmount;
        record.totalSolSpent += solAmount;
        record.investment += solAmount; // Track total lifetime investment
      } else {
        // Sell
      } else {
        // Sell
        if (record.totalTokensBought > 0) {
          const avgCostPerToken =
            record.totalSolSpent / record.totalTokensBought;
          const avgCostPerToken =
            record.totalSolSpent / record.totalTokensBought;
          const costOfGoodsSold = tokenAmount * avgCostPerToken;
          const tradePnl = solAmount - costOfGoodsSold;
          record.pnl += tradePnl;

          // Adjust running totals
          record.totalTokensBought -= tokenAmount;
          record.totalSolSpent -= costOfGoodsSold;

          // If we sold more than we had (due to data inconsistencies), clamp to zero
          if (record.totalTokensBought < 0) record.totalTokensBought = 0;
          if (record.totalSolSpent < 0) record.totalSolSpent = 0;
        }
      }
      pnlMap.set(tokenMint, record);
    }
    return pnlMap;
  }

  private async getTransactionStats(wallets: any[], apiKey: string) {
    const stats = {
      total: 0,
      buys: 0,
      sells: 0,
      transfers: 0,
      last_24h: 0,
    };

    const HELIUS_CACHE_TTL = 2 * 60 * 1000; // 2 minutes
    const now = Math.floor(Date.now() / 1000);
    const twentyFourHoursAgo = now - 24 * 60 * 60;
    const twentyFourHoursAgo = now - 24 * 60 * 60;

    for (const wallet of wallets) {
      const cacheKey = `helius-tx-stats-${wallet.address}`;
      const cachedTxs = await this.cacheManager.get<any[]>(cacheKey);
      const transactions: any[] =
        cachedTxs && Array.isArray(cachedTxs)
          ? cachedTxs
          : await (async () => {
              const url = `${this.solanaService.getHeliusBaseUrl()}/v0/addresses/${wallet.address}/transactions?api-key=${apiKey}&limit=100`;
              try {
                const response = await this.heliusGet(url);
                await this.cacheManager.set(
                  cacheKey,
                  response.data,
                  HELIUS_CACHE_TTL,
                );
                return response.data as any[];
              } catch (error) {
                if (
                  axios.isAxiosError(error) &&
                  error.response?.status === 404
                ) {
                  console.log(
                    `No transactions found for wallet ${wallet.address}.`,
                  );
                  await this.cacheManager.set(cacheKey, [], HELIUS_CACHE_TTL);
                } else {
                  console.error(
                    `Failed to fetch transaction stats for ${wallet.address}`,
                  );
                }
                return [];
              }
            })();

      for (const tx of transactions) {
        stats.total++;
        if (tx.blockTime > twentyFourHoursAgo) {
          stats.last_24h++;
        }

        if (tx.type === 'SWAP') {
          const tokenOut = tx.tokenTransfers.find(
            (t: any) => t.fromUserAccount === wallet.address,
          );
          if (tokenOut) {
            stats.sells++;
          } else {
            stats.buys++;
          }
        } else if (tx.type === 'TRANSFER') {
          stats.transfers++;
        }
      }
    }
    return stats;
  }

  private getTimeRange(timeFrame: string): { start: number; end: number } {
    const end = Date.now();
    let start: number;
    switch (timeFrame) {
      case '7d':
        start = end - 7 * 24 * 60 * 60 * 1000;
        break;
      case '30d':
        start = end - 30 * 24 * 60 * 60 * 1000;
        break;
      case '90d':
        start = end - 90 * 24 * 60 * 60 * 1000;
        break;
      case '1y':
        start = end - 365 * 24 * 60 * 60 * 1000;
        break;
      case 'all':
      default:
        // For 'all', we might need to find the first transaction date.
        // For simplicity, let's default to 1 year.
        start = end - 365 * 24 * 60 * 60 * 1000;
        break;
    }
    return { start, end };
  }

  private getIntervalMillis(interval: string): number {
    switch (interval) {
      case '1h':
        return 60 * 60 * 1000;
      case '1d':
        return 24 * 60 * 60 * 1000;
      case '1w':
        return 7 * 24 * 60 * 60 * 1000;
      default:
        return 24 * 60 * 60 * 1000; // Default to 1 day
    }
  }
}

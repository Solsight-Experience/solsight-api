import { Injectable, Inject } from '@nestjs/common';
import { WalletsService } from '../../wallets/services/wallets.service';
import { SolanaService } from '../../../infra/solana/solana.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import axios from 'axios';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

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
  constructor(
    private readonly walletsService: WalletsService,
    private readonly solanaService: SolanaService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  private async getSolPriceUsd(): Promise<number> {
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
      const price = response.data[SOL_COINGECKO_ID]?.usd;
      if (price) {
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

  private async getTokenList(): Promise<Map<string, TokenInfo>> {
    const cachedList =
      await this.cacheManager.get<Map<string, TokenInfo>>(TOKEN_LIST_CACHE_KEY);
    if (cachedList) {
      return cachedList;
    }

    try {
      const response = await axios.get(
        'https://raw.githubusercontent.com/solana-labs/token-list/main/src/tokens/solana.tokenlist.json',
      );
      const tokenList = response.data.tokens as TokenInfo[];
      const tokenMap = new Map(
        tokenList.map((token) => [token.address, token]),
      );
      await this.cacheManager.set(
        TOKEN_LIST_CACHE_KEY,
        tokenMap,
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
    let wallets = await this.walletsService.findByUserId(userId);

    if (walletAddresses && walletAddresses.length > 0) {
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

    positions.forEach((p) => (total_balance_usd += p.valueUsd));

    positions.sort((a, b) => b.valueUsd - a.valueUsd);

    const top_tokens = positions.slice(0, 5).map((p) => ({
      name: p.name || 'Unknown',
      symbol: p.symbol || '???',
      logo: p.logoURI || '',
      value_usd: p.valueUsd,
      price: p.price,
      change_24h: 0, // Placeholder
    }));

    const allocation = positions.map((p) => ({
      name: p.name || 'Unknown',
      symbol: p.symbol || '???',
      value_usd: p.valueUsd,
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
        top_tokens,
        allocation,
      };
    }

    const transactionStats = await this.getTransactionStats(
      wallets,
      heliusApiKey,
    );

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
    const now = Date.now();
    let startTime = now;
    let intervalMs = 24 * 60 * 60 * 1000; // Default 1d

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
        startTime = now - 2 * 365 * 24 * 60 * 60 * 1000; // 2 years
        break;
      default:
        startTime = now - 7 * 24 * 60 * 60 * 1000; // Default 7d
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

    const chartData: { timestamp: number; pnl: number; balance_usd: number }[] =
      [];
    let currentBalance = 10000 + Math.random() * 5000; // Start between 10k and 15k
    const initialBalance = currentBalance;

    for (let time = startTime; time <= now; time += intervalMs) {
      // Random fluctuation between -5% and +5%
      const changePercent = (Math.random() - 0.5) * 0.1;
      currentBalance = currentBalance * (1 + changePercent);

      // Ensure balance doesn't go below 0
      if (currentBalance < 0) currentBalance = 0;

      chartData.push({
        timestamp: time,
        pnl: currentBalance - initialBalance,
        balance_usd: currentBalance,
      });
    }

    return { chart_data: chartData };
  }

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

    if (targetWallets.length === 0) {
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

    const positions = Array.from(aggregatedTokens.entries()).map(
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

  async getActivities(
    userId: string,
    walletAddress: string,
    type: string, // 'all', 'buy', 'sell', 'transfer'
    limit: number = 20,
    before?: string, // signature
  ) {
    const wallets = await this.walletsService.findByUserId(userId);
    const targetWallet = wallets.find((w) => w.address === walletAddress);

    if (!targetWallet) {
      // Or throw a NotFoundException
      return {
        activities: [],
        total: 0,
        summary: { total_volume_usd: 0, total_fees_usd: 0 },
      };
    }

    const heliusApiKey = this.solanaService.getHeliusApiKey();
    if (!heliusApiKey) {
      console.error('Helius API Key is not configured.');
      return {
        activities: [],
        total: 0,
        summary: { total_volume_usd: 0, total_fees_usd: 0 },
      };
    }

    let heliusType = '';
    if (type === 'buy' || type === 'sell') {
      heliusType = 'SWAP';
    } else if (type === 'transfer') {
      heliusType = 'TRANSFER';
    }

    let url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=${limit}`;
    if (heliusType) {
      url += `&type=${heliusType}`;
    }
    if (before) {
      url += `&before=${before}`;
    }

    try {
      const response = await axios.get(url);
      let transactions = response.data;

      // Filter for buy/sell if needed
      if (type === 'buy') {
        transactions = transactions.filter((tx) => {
          if (tx.type !== 'SWAP') return false;
          // Heuristic: If no token transfer FROM user, it's a buy (SOL -> Token)
          // Note: This treats Token -> Token as a Sell of the source token.
          return !tx.tokenTransfers.find(
            (t) => t.fromUserAccount === walletAddress,
          );
        });
      } else if (type === 'sell') {
        transactions = transactions.filter((tx) => {
          if (tx.type !== 'SWAP') return false;
          // Heuristic: If token transfer FROM user exists, it's a sell (Token -> SOL or Token -> Token)
          return !!tx.tokenTransfers.find(
            (t) => t.fromUserAccount === walletAddress,
          );
        });
      }

      const activities = transactions.map((tx) => {
        const fee = tx.fee ? tx.fee / LAMPORTS_PER_SOL : 0;
        const status = tx.transactionError ? 'Failed' : 'Success';

        return {
          signature: tx.signature,
          block_time: tx.timestamp,
          type: tx.type,
          source: tx.source,
          status: status,
          fee: fee,
          details: tx,
        };
      });

      return {
        activities,
        total: activities.length,
        summary: {
          total_volume_usd: 0,
          total_fees_usd: 0,
        },
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return {
          activities: [],
          total: 0,
          summary: { total_volume_usd: 0, total_fees_usd: 0 },
        };
      }
      console.error('Failed to fetch activities from Helius', error);
      return {
        activities: [],
        total: 0,
        summary: { total_volume_usd: 0, total_fees_usd: 0 },
      };
    }
  }

  async getPerformance(
    userId: string,
    walletAddresses: string[],
    timeFrame: string,
  ) {
    // Mock data generation
    const tokens = [
      { symbol: 'SOL', name: 'Solana' },
      { symbol: 'BONK', name: 'Bonk' },
      { symbol: 'WIF', name: 'dogwifhat' },
      { symbol: 'JUP', name: 'Jupiter' },
      { symbol: 'RAY', name: 'Raydium' },
      { symbol: 'PYTH', name: 'Pyth Network' },
      { symbol: 'JTO', name: 'Jito' },
      { symbol: 'RLB', name: 'Rollbit Coin' },
      { symbol: 'HNT', name: 'Helium' },
      { symbol: 'BLZE', name: 'Blaze' },
    ];

    const tokenPerformance = tokens.map((t) => {
      const pnl = (Math.random() - 0.4) * 1000; // Random PnL between -400 and 600
      const investment = 500 + Math.random() * 1000;
      const roi_percent = (pnl / investment) * 100;
      return {
        token: t.name,
        symbol: t.symbol,
        pnl,
        roi_percent,
      };
    });

    // Sort by PnL
    tokenPerformance.sort((a, b) => b.pnl - a.pnl);

    const top_performers = tokenPerformance.slice(0, 3);
    const worst_performers = tokenPerformance.slice(-3).reverse();

    const total_pnl = tokenPerformance.reduce((acc, t) => acc + t.pnl, 0);
    const total_investment = tokenPerformance.reduce(
      (acc, t) => acc + t.pnl / (t.roi_percent / 100),
      0,
    ); // Reverse calc for approx investment
    const total_roi_percent =
      total_investment > 0 ? (total_pnl / total_investment) * 100 : 0;

    const winning_trades = tokenPerformance.filter((t) => t.pnl > 0).length;
    const win_rate = (winning_trades / tokenPerformance.length) * 100;

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

  private async fetchAllTrades(wallets: any[], apiKey: string): Promise<any[]> {
    // In a real app, this would paginate through all transactions for all wallets.
    // For this example, we'll just get the last 100 swaps for each wallet.
    let allSwaps = [];
    for (const wallet of wallets) {
      const url = `https://api.helius.xyz/v0/addresses/${wallet.address}/transactions?api-key=${apiKey}&type=SWAP&limit=100`;
      try {
        const response = await axios.get(url);
        allSwaps = allSwaps.concat(response.data);
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          // Helius returns 404 when no transactions are found, which is not an error for us.
          console.log(
            `No swap transactions found for wallet ${wallet.address}.`,
          );
        } else {
          console.error(`Failed to fetch trades for ${wallet.address}`, error);
        }
      }
    }
    return allSwaps;
  }

  private calculatePnl(
    trades: any[],
  ): Map<
    string,
    { token: string; symbol: string; pnl: number; investment: number }
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
      const description = trade.description;

      if (!tokenOut || !tokenIn || !description) continue;

      // Extract symbol from description like "Swapped 2.02 SOL for 2,234.18 WIF"
      const symbolMatch = description.match(/for [\d,.]+ (\w+)/);
      const tradeSymbol = symbolMatch ? symbolMatch[1] : '?';

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
        if (record.totalTokensBought > 0) {
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

    const now = Math.floor(Date.now() / 1000);
    const twentyFourHoursAgo = now - 24 * 60 * 60;

    for (const wallet of wallets) {
      const url = `https://api.helius.xyz/v0/addresses/${wallet.address}/transactions?api-key=${apiKey}&limit=100`;
      try {
        const response = await axios.get(url);
        const transactions = response.data;

        for (const tx of transactions) {
          stats.total++;
          if (tx.blockTime > twentyFourHoursAgo) {
            stats.last_24h++;
          }

          if (tx.type === 'SWAP') {
            const tokenOut = tx.tokenTransfers.find(
              (t) => t.fromUserAccount === wallet.address,
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
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          console.log(`No transactions found for wallet ${wallet.address}.`);
        } else {
          console.error(
            `Failed to fetch transaction stats for ${wallet.address}`,
            error,
          );
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

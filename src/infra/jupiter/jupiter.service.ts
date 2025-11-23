import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import axios, { AxiosInstance } from 'axios';

export interface JupiterTokenPrice {
  id: string;
  mintSymbol: string;
  vsToken: string;
  vsTokenSymbol: string;
  price: number;
}

export interface JupiterToken {
  address: string;
  chainId: number;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
  tags?: string[];
  extensions?: {
    coingeckoId?: string;
  };
}

@Injectable()
export class JupiterService {
  private readonly logger = new Logger(JupiterService.name);
  private readonly apiClient: AxiosInstance;
  private readonly priceApiClient: AxiosInstance;
  private tokenListCache: JupiterToken[] = [];
  private tokenListCacheTime = 0;
  private readonly CACHE_DURATION = 3600000; // 1 hour

  constructor(private readonly configService: ConfigService) {
    const apiUrl = this.configService.get<string>('jupiter.apiUrl');
    const priceApiUrl = this.configService.get<string>('jupiter.priceApiUrl');

    this.apiClient = axios.create({
      baseURL: apiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.priceApiClient = axios.create({
      baseURL: priceApiUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`Jupiter API initialized: ${apiUrl}`);
    this.logger.log(`Jupiter Price API initialized: ${priceApiUrl}`);
  }

  /**
   * Get token prices from Jupiter
   * @param tokenAddresses Array of token mint addresses
   * @returns Map of token address to price in USD
   */
  async getTokenPrices(
    tokenAddresses: string[],
  ): Promise<Map<string, number>> {
    try {
      const ids = tokenAddresses.join(',');
      const response = await this.priceApiClient.get<{
        data: Record<string, JupiterTokenPrice>;
      }>('/price', {
        params: {
          ids,
          vsToken: 'USDC', // Price in USDC
        },
      });

      const priceMap = new Map<string, number>();
      if (response.data && response.data.data) {
        for (const [address, priceData] of Object.entries(
          response.data.data,
        )) {
          priceMap.set(address, priceData.price);
        }
      }

      this.logger.log(`Fetched prices for ${priceMap.size} tokens`);
      return priceMap;
    } catch (error) {
      this.logger.error('Failed to fetch token prices from Jupiter', error);
      return new Map();
    }
  }

  /**
   * Get single token price
   */
  async getTokenPrice(tokenAddress: string): Promise<number | null> {
    const prices = await this.getTokenPrices([tokenAddress]);
    return prices.get(tokenAddress) || null;
  }

  /**
   * Get all verified tokens from Jupiter
   */
  async getTokenList(): Promise<JupiterToken[]> {
    // Return cached data if still valid
    const now = Date.now();
    if (
      this.tokenListCache.length > 0 &&
      now - this.tokenListCacheTime < this.CACHE_DURATION
    ) {
      this.logger.debug('Returning cached token list');
      return this.tokenListCache;
    }

    try {
      const response = await this.apiClient.get<JupiterToken[]>('/tokens');
      this.tokenListCache = response.data;
      this.tokenListCacheTime = now;

      this.logger.log(`Fetched ${this.tokenListCache.length} tokens from Jupiter`);
      return this.tokenListCache;
    } catch (error) {
      this.logger.error('Failed to fetch token list from Jupiter', error);
      return this.tokenListCache; // Return stale cache on error
    }
  }

  /**
   * Get token info by address
   */
  async getTokenInfo(tokenAddress: string): Promise<JupiterToken | null> {
    const tokens = await this.getTokenList();
    return tokens.find((t) => t.address === tokenAddress) || null;
  }

  /**
   * Search tokens by symbol or name
   */
  async searchTokens(query: string): Promise<JupiterToken[]> {
    const tokens = await this.getTokenList();
    const lowerQuery = query.toLowerCase();

    return tokens.filter(
      (t) =>
        t.symbol.toLowerCase().includes(lowerQuery) ||
        t.name.toLowerCase().includes(lowerQuery),
    );
  }
}

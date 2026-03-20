import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

export interface JupiterPriceV3Item {
  createdAt: string;
  liquidity: number;
  usdPrice: number;
  blockId: number | null;
  decimals: number;
  priceChange24h: number | null;
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

interface JupiterTokenV2 {
  id: string;
  decimals: number;
  name: string;
  symbol: string;
  icon?: string | null;
  tags?: string[];
  extensions?: {
    coingeckoId?: string;
  };
}

export interface CreateOrderParams {
  inputMint: string;
  outputMint: string;
  maker: string;
  payer?: string;
  params: {
    makingAmount: string;
    takingAmount: string;
    slippageBps?: string;
    expiredAt?: string;
    feeBps?: string;
  };
  computeUnitPrice?: string;
  feeAccount?: string;
  wrapAndUnwrapSol?: boolean;
}

export interface CreateOrderResponse {
  order: string;
  transaction: string;
  requestId: string;
}

export interface CancelOrderResponse {
  transaction: string;
  requestId: string;
}

export interface CancelOrdersResponse {
  transactions: string[];
  requestId: string;
}

export interface ExecuteResponse {
  signature: string;
}

@Injectable()
export class JupiterService {
  private readonly logger = new Logger(JupiterService.name);
  private readonly apiClient: AxiosInstance;
  private tokenListCache: JupiterToken[] = [];
  private tokenListCacheTime = 0;
  private readonly CACHE_DURATION = 3600000; // 1 hour

  constructor(private readonly configService: ConfigService) {
    const baseUrl = this.configService.get<string>('jupiter.apiUrl');
    const apiKey = this.configService.get<string>('jupiter.apiKey');

    this.apiClient = axios.create({
      baseURL: baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
    });

    this.logger.log(`Jupiter API initialized: ${baseUrl}`);
  }

  private normalizeToken(token: JupiterTokenV2): JupiterToken {
    return {
      address: token.id,
      chainId: 101,
      decimals: token.decimals,
      name: token.name,
      symbol: token.symbol,
      logoURI: token.icon || undefined,
      tags: token.tags,
      extensions: token.extensions,
    };
  }

  /**
   * Get token prices from Jupiter
   * @param tokenAddresses Array of token mint addresses
   * @returns Map of token address to price in USD
   */
  async getTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
    if (tokenAddresses.length === 0) {
      return new Map();
    }

    try {
      const priceMap = new Map<string, number>();
      const chunkSize = 50;

      for (let i = 0; i < tokenAddresses.length; i += chunkSize) {
        const ids = tokenAddresses.slice(i, i + chunkSize).join(',');

        const response = await this.apiClient.get<Record<string, JupiterPriceV3Item>>('/price/v3', {
          params: { ids },
        });

        if (!response.data) {
          continue;
        }

        for (const [address, priceData] of Object.entries(response.data)) {
          if (typeof priceData.usdPrice === 'number') {
            priceMap.set(address, priceData.usdPrice);
          }
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
    if (this.tokenListCache.length > 0 && now - this.tokenListCacheTime < this.CACHE_DURATION) {
      this.logger.debug('Returning cached token list');
      return this.tokenListCache;
    }

    try {
      const response = await this.apiClient.get<JupiterTokenV2[]>('/tokens/v2/tag', {
        params: {
          query: 'verified',
        },
      });
      this.tokenListCache = Array.isArray(response.data) ? response.data.map((token) => this.normalizeToken(token)) : [];
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
    try {
      const response = await this.apiClient.get<JupiterTokenV2[]>('/tokens/v2/search', {
        params: {
          query: tokenAddress,
        },
      });

      if (!Array.isArray(response.data) || response.data.length === 0) {
        return null;
      }

      const matchedToken = response.data.find((token) => token.id === tokenAddress) || response.data[0];
      return this.normalizeToken(matchedToken);
    } catch (error) {
      this.logger.error(`Failed to fetch token info for ${tokenAddress} from Jupiter`, error);
      return null;
    }
  }

  /**
   * Search tokens by symbol or name
   */
  async searchTokens(query: string): Promise<JupiterToken[]> {
    try {
      const response = await this.apiClient.get<JupiterTokenV2[]>('/tokens/v2/search', {
        params: {
          query,
        },
      });

      const tokens = Array.isArray(response.data) ? response.data.map((token) => this.normalizeToken(token)) : [];

      this.logger.log(`Found ${tokens.length} Jupiter tokens for query: ${query}`);
      return tokens;
    } catch (error) {
      this.logger.error(`Failed to search tokens for query: ${query}`, error);
      return [];
    }
  }

  /**
   * Create a limit order on Jupiter
   */
  async createOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
    try {
      this.logger.log(`Creating limit order: ${params.inputMint} -> ${params.outputMint}`);

      const response = await this.apiClient.post<CreateOrderResponse>('/trigger/v1/createOrder', params);

      this.logger.log(`Order created successfully: ${response.data.order}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to create limit order', error);
      throw error;
    }
  }

  /**
   * Cancel a single limit order
   */
  async cancelOrder(maker: string, order: string, computeUnitPrice = 'auto'): Promise<CancelOrderResponse> {
    try {
      this.logger.log(`Canceling order: ${order}`);

      const response = await this.apiClient.post<CancelOrderResponse>('/trigger/v1/cancelOrder', {
        maker,
        order,
        computeUnitPrice,
      });

      this.logger.log(`Order cancelled successfully: ${order}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to cancel order: ${order}`, error);
      throw error;
    }
  }

  /**
   * Cancel multiple limit orders (batched in groups of 5)
   */
  async cancelOrders(maker: string, orders?: string[], computeUnitPrice = 'auto'): Promise<CancelOrdersResponse> {
    try {
      this.logger.log(`Canceling ${orders?.length || 'all'} orders for maker: ${maker}`);

      const payload: {
        maker: string;
        computeUnitPrice: string;
        orders?: string[];
      } = {
        maker,
        computeUnitPrice,
      };

      if (orders && orders.length > 0) {
        payload.orders = orders;
      }

      const response = await this.apiClient.post<CancelOrdersResponse>('/trigger/v1/cancelOrders', payload);

      this.logger.log(`Orders cancelled successfully`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to cancel orders', error);
      throw error;
    }
  }

  /**
   * Get trigger orders (active or history)
   */
  async getTriggerOrders(
    user: string,
    orderStatus: 'active' | 'history',
    inputMint?: string,
    outputMint?: string,
    page = 1,
    includeFailedTx?: boolean,
  ): Promise<any> {
    try {
      const params: {
        user: string;
        orderStatus: 'active' | 'history';
        page: number;
        inputMint?: string;
        outputMint?: string;
        includeFailedTx?: 'true' | 'false';
      } = {
        user,
        orderStatus,
        page,
      };

      if (inputMint) {
        params.inputMint = inputMint;
      }
      if (outputMint) {
        params.outputMint = outputMint;
      }
      if (includeFailedTx !== undefined) {
        params.includeFailedTx = includeFailedTx ? 'true' : 'false';
      }

      this.logger.log(`Getting ${orderStatus} orders for user: ${user}`);

      const response = await this.apiClient.get('/trigger/v1/getTriggerOrders', {
        params,
      });

      return response.data;
    } catch (error) {
      this.logger.error('Failed to get trigger orders', error);
      throw error;
    }
  }

  /**
   * Execute a limit order transaction
   */
  async executeOrder(requestId: string, signedTransaction: string): Promise<ExecuteResponse> {
    try {
      this.logger.log(`Executing order with requestId: ${requestId}`);

      const response = await this.apiClient.post<ExecuteResponse>('/trigger/v1/execute', {
        requestId,
        signedTransaction,
      });

      this.logger.log(`Order executed successfully: ${response.data.signature}`);
      return response.data;
    } catch (error) {
      this.logger.error('Failed to execute order', error);
      throw error;
    }
  }
}

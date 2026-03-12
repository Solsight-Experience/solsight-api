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
  private readonly priceApiClient: AxiosInstance;
  private readonly triggerApiClient: AxiosInstance;
  private tokenListCache: JupiterToken[] = [];
  private tokenListCacheTime = 0;
  private readonly CACHE_DURATION = 3600000; // 1 hour

  constructor(private readonly configService: ConfigService) {
    const apiUrl = this.configService.get<string>('jupiter.apiUrl');
    const priceApiUrl = this.configService.get<string>('jupiter.priceApiUrl');
    const triggerApiUrl = this.configService.get<string>('jupiter.triggerApiUrl');
    const apiKey = this.configService.get<string>('jupiter.apiKey');

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

    const triggerHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (apiKey) {
      triggerHeaders['x-api-key'] = apiKey;
    }

    this.triggerApiClient = axios.create({
      baseURL: triggerApiUrl,
      timeout: 15000,
      headers: triggerHeaders,
    });

    this.logger.log(`Jupiter API initialized: ${apiUrl}`);
    this.logger.log(`Jupiter Price API initialized: ${priceApiUrl}`);
    this.logger.log(`Jupiter Trigger API initialized: ${triggerApiUrl}`);
  }

  /**
   * Get token prices from Jupiter
   * @param tokenAddresses Array of token mint addresses
   * @returns Map of token address to price in USD
   */
  async getTokenPrices(tokenAddresses: string[]): Promise<Map<string, number>> {
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
        for (const [address, priceData] of Object.entries(response.data.data)) {
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
    if (this.tokenListCache.length > 0 && now - this.tokenListCacheTime < this.CACHE_DURATION) {
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
      (t) => t.symbol.toLowerCase().includes(lowerQuery) || t.name.toLowerCase().includes(lowerQuery),
    );
  }

  /**
   * Create a limit order on Jupiter
   */
  async createOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
    try {
      this.logger.log(`Creating limit order: ${params.inputMint} -> ${params.outputMint}`);

      const response = await this.triggerApiClient.post<CreateOrderResponse>('/createOrder', params);

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

      const response = await this.triggerApiClient.post<CancelOrderResponse>('/cancelOrder', {
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

      const payload: any = {
        maker,
        computeUnitPrice,
      };

      if (orders && orders.length > 0) {
        payload.orders = orders;
      }

      const response = await this.triggerApiClient.post<CancelOrdersResponse>('/cancelOrders', payload);

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
  ): Promise<any> {
    try {
      const params: any = {
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

      this.logger.log(`Getting ${orderStatus} orders for user: ${user}`);

      const response = await this.triggerApiClient.get('/getTriggerOrders', {
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

      const response = await this.triggerApiClient.post<ExecuteResponse>('/execute', {
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

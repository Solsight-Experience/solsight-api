import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import {
    CancelOrderParams,
    CancelOrderResponse,
    CancelOrdersResponse,
    CreateOrderParams,
    CreateOrderResponse,
    ExecuteParams,
    ExecuteResponse,
    JupiterPriceV3Item,
    JupiterTokenMintInformation,
    JupiterTokenV2
} from "./types";

@Injectable()
export class JupiterService {
    private readonly logger = new Logger(JupiterService.name);
    private readonly apiClient: AxiosInstance;
    private readonly swapApiClient: AxiosInstance;
    private tokenListCache: JupiterTokenV2[] = [];
    private tokenListCacheTime = 0;
    private readonly CACHE_DURATION = 3600000; // 1 hour

    constructor(private readonly configService: ConfigService) {
        const baseUrl = this.configService.get<string>("jupiter.apiUrl");
        const apiKey = this.configService.get<string>("jupiter.apiKey");
        const swapBaseUrl = this.configService.get<string>("jupiter.swapApiUrl") ?? baseUrl;
        const swapApiKey = this.configService.get<string>("jupiter.swapApiKey") ?? apiKey;

        this.apiClient = axios.create({
            baseURL: baseUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "x-api-key": apiKey } : {})
            }
        });

        this.swapApiClient = axios.create({
            baseURL: swapBaseUrl,
            timeout: 15000,
            headers: {
                "Content-Type": "application/json",
                ...(swapApiKey ? { "x-api-key": swapApiKey } : {})
            }
        });

        this.logger.log(`Jupiter API initialized: ${baseUrl}`);
        this.logger.log(`Jupiter Swap API initialized: ${swapBaseUrl}`);
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
                const ids = tokenAddresses.slice(i, i + chunkSize).join(",");

                const response = await this.apiClient.get<Record<string, JupiterPriceV3Item>>("/price/v3", {
                    params: { ids }
                });

                if (!response.data) {
                    continue;
                }

                for (const [address, priceData] of Object.entries(response.data)) {
                    if (typeof priceData.usdPrice === "number") {
                        priceMap.set(address, priceData.usdPrice);
                    }
                }
            }

            this.logger.log(`Fetched prices for ${priceMap.size} tokens`);
            return priceMap;
        } catch (error) {
            this.logger.error("Failed to fetch token prices from Jupiter", error);
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
    async getTokenList(): Promise<JupiterTokenV2[]> {
        // Return cached data if still valid
        const now = Date.now();
        if (this.tokenListCache.length > 0 && now - this.tokenListCacheTime < this.CACHE_DURATION) {
            this.logger.debug("Returning cached token list");
            return this.tokenListCache;
        }

        try {
            const response = await this.apiClient.get<JupiterTokenV2[]>("/tokens/v2/tag", {
                params: {
                    query: "verified"
                }
            });
            this.tokenListCache = Array.isArray(response.data) ? response.data : [];
            this.tokenListCacheTime = now;

            this.logger.log(`Fetched ${this.tokenListCache.length} tokens from Jupiter`);
            return this.tokenListCache;
        } catch (error) {
            this.logger.error("Failed to fetch token list from Jupiter", error);
            return this.tokenListCache; // Return stale cache on error
        }
    }

    async searchTokens(tokenAddresses: string[]): Promise<JupiterTokenMintInformation[]> {
        try {
            const response = await this.apiClient.get<JupiterTokenMintInformation[]>("/tokens/v2/search", {
                params: {
                    query: tokenAddresses.join(",")
                }
            });

            if (!Array.isArray(response.data) || response.data.length === 0) {
                return [];
            }

            return response.data;
        } catch (error) {
            this.logger.error(`Failed to fetch token info for ${tokenAddresses.join(",")} from Jupiter`, error);
            return [];
        }
    }

    /**
     * Get token info from Jupiter (normalized to JupiterToken interface)
     */
    async searchToken(tokenAddress: string): Promise<JupiterTokenMintInformation | null> {
        const response = await this.searchTokens([tokenAddress]);
        if (response.length == 0) {
            return null;
        }
        return response[0];
    }

    /**
     * Create a limit order on Jupiter
     */
    async createOrder(params: CreateOrderParams): Promise<CreateOrderResponse> {
        try {
            this.logger.log(`Creating limit order: ${params.inputMint} -> ${params.outputMint}`);

            const response = await this.apiClient.post<CreateOrderResponse>("/trigger/v1/createOrder", params);

            this.logger.log(`Order created successfully: ${response.data.order}`);
            return response.data;
        } catch (error) {
            this.logger.error("Failed to create limit order", error);
            throw error;
        }
    }

    /**
     * Cancel a single limit order
     */
    async cancelOrder(cancelOrderParams: CancelOrderParams): Promise<CancelOrderResponse> {
        const order = cancelOrderParams.order;
        try {
            this.logger.log(`Canceling order: ${order}`);

            const response = await this.apiClient.post<CancelOrderResponse>("/trigger/v1/cancelOrder", cancelOrderParams);

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
    async cancelOrders(maker: string, orders?: string[], computeUnitPrice = "auto"): Promise<CancelOrdersResponse> {
        try {
            this.logger.log(`Canceling ${orders?.length || "all"} orders for maker: ${maker}`);

            const payload: {
                maker: string;
                computeUnitPrice: string;
                orders?: string[];
            } = {
                maker,
                computeUnitPrice
            };

            if (orders && orders.length > 0) {
                payload.orders = orders;
            }

            const response = await this.apiClient.post<CancelOrdersResponse>("/trigger/v1/cancelOrders", payload);

            this.logger.log(`Orders cancelled successfully`);
            return response.data;
        } catch (error) {
            this.logger.error("Failed to cancel orders", error);
            throw error;
        }
    }

    /**
     * Get trigger orders (active or history)
     */
    async getTriggerOrders(
        user: string,
        orderStatus: "active" | "history",
        inputMint?: string,
        outputMint?: string,
        page = 1,
        includeFailedTx?: boolean
    ): Promise<any> {
        try {
            const params: {
                user: string;
                orderStatus: "active" | "history";
                page: number;
                inputMint?: string;
                outputMint?: string;
                includeFailedTx?: "true" | "false";
            } = {
                user,
                orderStatus,
                page
            };

            if (inputMint) {
                params.inputMint = inputMint;
            }
            if (outputMint) {
                params.outputMint = outputMint;
            }
            if (includeFailedTx !== undefined) {
                params.includeFailedTx = includeFailedTx ? "true" : "false";
            }

            this.logger.log(`Getting ${orderStatus} orders for user: ${user}`);

            const response = await this.apiClient.get("/trigger/v1/getTriggerOrders", {
                params
            });

            return response.data;
        } catch (error) {
            this.logger.error("Failed to get trigger orders", error);
            throw error;
        }
    }

    /**
     * Get a swap quote from Jupiter
     */
    async getSwapQuote(params: {
        inputMint: string;
        outputMint: string;
        amount: string;
        swapMode: string;
        slippageBps: number;
    }): Promise<Record<string, unknown>> {
        try {
            const response = await this.swapApiClient.get<Record<string, unknown>>("/swap/v1/quote", { params });
            return response.data;
        } catch (error) {
            this.logger.error("Failed to get swap quote", error);
            throw error;
        }
    }

    /**
     * Get an unsigned swap transaction from Jupiter
     */
    async getSwapTransaction(params: {
        quoteResponse: Record<string, unknown>;
        userPublicKey: string;
        wrapAndUnwrapSol?: boolean;
    }): Promise<{ swapTransaction: string }> {
        try {
            const response = await this.swapApiClient.post<{ swapTransaction: string }>("/swap/v1/swap", {
                ...params,
                wrapAndUnwrapSol: params.wrapAndUnwrapSol ?? true
            });
            return response.data;
        } catch (error) {
            this.logger.error("Failed to get swap transaction", error);
            throw error;
        }
    }

    /**
     * Execute a limit order transaction
     */
    async executeOrder(executeOrderParams: ExecuteParams): Promise<ExecuteResponse> {
        const requestId = executeOrderParams.requestId;
        try {
            this.logger.log(`Executing order with requestId: ${requestId}`);

            const response = await this.apiClient.post<ExecuteResponse>("/trigger/v1/execute", executeOrderParams);

            this.logger.log(`Order executed successfully: ${response.data.signature}`);
            return response.data;
        } catch (error) {
            this.logger.error("Failed to execute order", error);
            throw error;
        }
    }
}

import { Injectable } from "@nestjs/common";
import { BaseSolanaRpcService } from "./base-solana-rpc.service";
import axios, { AxiosInstance } from "axios";
import { EnhancedTransaction, GetAssetResponse, GetEnhancedTransactionsByAddressParams, HeliusCommitment, RpcResponse } from "./constants/types";

@Injectable()
export class HeliusService extends BaseSolanaRpcService {
    private readonly apiClient: AxiosInstance;
    private readonly baseRpcPayload = {
        jsonrpc: "2.0",
        id: "1"
    };

    constructor(rpcUrl: string, apiKey: string) {
        super(rpcUrl);
        const restBaseUrl = new URL(rpcUrl);
        restBaseUrl.search = "";
        this.apiClient = axios.create({
            baseURL: restBaseUrl.toString(),
            timeout: 10000,
            headers: {
                "Content-Type": "application/json"
            },
            params: {
                "api-key": apiKey
            }
        });
    }

    async getAsset(
        id: string,
        options?: {
            showInscription: false;
            showUnverifiedCollections: false;
            showCollectionMetadata: false;
            showFungible: false;
        }
    ): Promise<GetAssetResponse> {
        const { data } = await this.apiClient.post<RpcResponse<GetAssetResponse>>(
            "/",
            {
                ...this.baseRpcPayload,
                method: "getAsset",
                params: {
                    id: id,
                    options: options
                }
            },
            { timeout: 4000 }
        );

        return data.result;
    }

    async getEnhancedTransactions(transactions: string[], commitment?: HeliusCommitment): Promise<EnhancedTransaction[]> {
        const { data } = await this.apiClient.post<EnhancedTransaction[]>(
            "/v0/transactions",
            { transactions },
            {
                timeout: 10000,
                params: {
                    ...(commitment && { commitment })
                }
            }
        );

        return data;
    }

    async getEnhancedTransactionsByAddress(address: string, params: GetEnhancedTransactionsByAddressParams = {}): Promise<EnhancedTransaction[]> {
        const { data } = await this.apiClient.get<EnhancedTransaction[]>(`/v0/addresses/${address}/transactions`, {
            timeout: 10000,
            params: {
                ...(params.beforeSignature && { "before-signature": params.beforeSignature }),
                ...(params.afterSignature && { "after-signature": params.afterSignature }),
                ...(params.commitment && { commitment: params.commitment }),
                ...(params.tokenAccounts && { "token-accounts": params.tokenAccounts }),
                ...(params.sortOrder && { "sort-order": params.sortOrder }),
                ...(params.gtSlot !== undefined && { "gt-slot": params.gtSlot }),
                ...(params.gteSlot !== undefined && { "gte-slot": params.gteSlot }),
                ...(params.ltSlot !== undefined && { "lt-slot": params.ltSlot }),
                ...(params.lteSlot !== undefined && { "lte-slot": params.lteSlot }),
                ...(params.gtTime !== undefined && { "gt-time": params.gtTime }),
                ...(params.gteTime !== undefined && { "gte-time": params.gteTime }),
                ...(params.ltTime !== undefined && { "lt-time": params.ltTime }),
                ...(params.lteTime !== undefined && { "lte-time": params.lteTime }),
                ...(params.source && { source: params.source }),
                ...(params.type && { type: params.type }),
                ...(params.limit !== undefined && { limit: params.limit })
            }
        });

        return data;
    }
}

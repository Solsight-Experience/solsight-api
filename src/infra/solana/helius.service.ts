import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { BaseSolanaRpcService } from "./base-solana-rpc.service";
import axios, { AxiosInstance } from "axios";
import { EnhancedTransaction, GetAssetResponse, RpcResponse } from "./constants/types";

@Injectable()
export class HeliusService extends BaseSolanaRpcService {
    private readonly apiClient: AxiosInstance;
    private readonly baseRpcPayload = {
        jsonrpc: "2.0",
        id: "1"
    };

    constructor(configService: ConfigService) {
        const [rpcUrl, apiKey] = [configService.get("heliusRpcUrl"), configService.get("heliusApiKey")];
        super(rpcUrl);
        this.apiClient = axios.create({
            baseURL: rpcUrl,
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

    async getEnhancedTransactions(transactions: string[], commitment?: "finalized" | "confirmed"): Promise<EnhancedTransaction[]> {
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
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { KoraService } from "../kora/kora.service";
import { ExecutorCapability, type ExecutorCapabilities } from "../executor/interfaces/executor-capabilities.interface";
import type { ExecutorService, QuoteParams, QuoteResponse, SwapRequest, SwapResponse } from "../executor/interfaces/executor-service.interface";
import type { Cluster } from "../../common/cluster/cluster.types";

@Injectable()
export class SolsightExecutorService implements ExecutorService {
    private readonly logger = new Logger(SolsightExecutorService.name);
    private readonly apiClient: AxiosInstance;

    constructor(
        private readonly configService: ConfigService,
        private readonly koraService: KoraService
    ) {
        const baseUrl = this.configService.get<string>("solsightExecutor.apiUrl");
        const apiKey = this.configService.get<string>("solsightExecutor.apiKey");

        this.apiClient = axios.create({
            baseURL: baseUrl,
            timeout: 15000,
            headers: {
                "Content-Type": "application/json",
                ...(apiKey ? { "x-api-key": apiKey } : {})
            }
        });

        this.logger.log(`Solsight executor API initialized: ${baseUrl}`);
    }

    async getCapabilities(): Promise<ExecutorCapabilities> {
        if (!this.koraService.isEnabled()) {
            return {
                executorKey: "solsight",
                capabilities: [],
                gaslessSupportedTokens: [],
                payerPubkey: null
            };
        }

        try {
            const [gaslessSupportedTokens, payerPubkey] = await Promise.all([this.koraService.getSupportedTokens(), this.koraService.getPayerPubkey()]);
            return {
                executorKey: "solsight",
                capabilities: [ExecutorCapability.Gasless],
                gaslessSupportedTokens,
                payerPubkey
            };
        } catch (error) {
            this.logger.warn(`Kora capability lookup failed; disabling gasless: ${error instanceof Error ? error.message : String(error)}`);
            return {
                executorKey: "solsight",
                capabilities: [],
                gaslessSupportedTokens: [],
                payerPubkey: null
            };
        }
    }

    async getQuote(cluster: Cluster, params: QuoteParams): Promise<QuoteResponse> {
        try {
            const response = await this.apiClient.get<QuoteResponse>("/quote", { params: { ...params, cluster } });
            return response.data;
        } catch (error) {
            this.logger.error("Failed to get swap quote from solsight-executor", error);
            throw error;
        }
    }

    async getSwapTransaction(cluster: Cluster, params: SwapRequest): Promise<SwapResponse> {
        try {
            const response = await this.apiClient.post<SwapResponse>("/swap", { ...params, cluster });
            return response.data;
        } catch (error) {
            this.logger.error("Failed to get swap transaction from solsight-executor", error);
            throw error;
        }
    }
}

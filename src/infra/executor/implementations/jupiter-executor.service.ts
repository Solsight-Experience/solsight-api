import { Injectable } from "@nestjs/common";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { JupiterService } from "../../jupiter/jupiter.service";
import type { ExecutorService, QuoteParams, QuoteResponse, SwapRequest, SwapResponse } from "../interfaces/executor-service.interface";

@Injectable()
export class JupiterExecutorService implements ExecutorService {
    constructor(private readonly jupiterService: JupiterService) {}

    async getQuote(cluster: Cluster, params: QuoteParams): Promise<QuoteResponse> {
        return this.jupiterService.getSwapQuote(cluster, params);
    }

    async getSwapTransaction(cluster: Cluster, params: SwapRequest): Promise<SwapResponse> {
        return this.jupiterService.getSwapTransaction(cluster, params);
    }
}

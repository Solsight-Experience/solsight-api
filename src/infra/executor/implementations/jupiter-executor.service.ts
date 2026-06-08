import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { JupiterService } from "../../jupiter/jupiter.service";
import type { ExecutorService, QuoteParams, QuoteResponse, SwapRequest, SwapResponse } from "../interfaces/executor-service.interface";

@Injectable()
export class JupiterExecutorService implements ExecutorService {
    constructor(private readonly jupiterService: JupiterService) {}

    async getQuote(params: QuoteParams): Promise<QuoteResponse> {
        const quote = await this.jupiterService.getSwapQuote(params);
        if (!quote) {
            throw new ServiceUnavailableException("Jupiter swap quotes are only available on mainnet.");
        }
        return quote;
    }

    async getSwapTransaction(params: SwapRequest): Promise<SwapResponse> {
        const swapTransaction = await this.jupiterService.getSwapTransaction(params);
        if (!swapTransaction) {
            throw new ServiceUnavailableException("Jupiter swap transactions are only available on mainnet.");
        }
        return swapTransaction;
    }
}

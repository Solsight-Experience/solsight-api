import { Injectable } from "@nestjs/common";
import { JupiterService } from "../../jupiter/jupiter.service";
import type { ExecutorService, QuoteParams, QuoteResponse, SwapRequest, SwapResponse } from "../interfaces/executor-service.interface";

@Injectable()
export class JupiterExecutorService implements ExecutorService {
    constructor(private readonly jupiterService: JupiterService) {}

    async getQuote(params: QuoteParams): Promise<QuoteResponse> {
        return this.jupiterService.getSwapQuote(params);
    }

    async getSwapTransaction(params: SwapRequest): Promise<SwapResponse> {
        return this.jupiterService.getSwapTransaction(params);
    }
}

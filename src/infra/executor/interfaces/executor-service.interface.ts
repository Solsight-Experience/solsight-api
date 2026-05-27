import type { JupiterGetSwapQuoteParams, JupiterQuoteResponse, JupiterSwapRequest, JupiterSwapResponse } from "../../jupiter/types";

/**
 * Provider-agnostic types consumed by the swap module.
 *
 * Currently structurally compatible with Jupiter's responses; this indirection
 * lets us swap implementations (e.g. solsight-executor) without touching
 * controllers, DTOs, or feature services.
 */
export interface QuoteParams extends JupiterGetSwapQuoteParams {}
export interface QuoteResponse extends JupiterQuoteResponse {}
export interface SwapRequest extends JupiterSwapRequest {}
export interface SwapResponse extends JupiterSwapResponse {}

export interface ExecutorService {
    /**
     * Fetch a swap quote for the given input/output mint pair.
     */
    getQuote(params: QuoteParams): Promise<QuoteResponse>;

    /**
     * Build an unsigned swap transaction from a previously fetched quote.
     */
    getSwapTransaction(params: SwapRequest): Promise<SwapResponse>;
}

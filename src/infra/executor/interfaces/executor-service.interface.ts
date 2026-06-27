import type { JupiterGetSwapQuoteParams, JupiterQuoteResponse, JupiterSwapRequest, JupiterSwapResponse } from "../../jupiter/types";
import type { Cluster } from "../../../common/cluster/cluster.types";

/**
 * Provider-agnostic types consumed by the swap module.
 *
 * Currently structurally compatible with Jupiter's responses; this indirection
 * lets us swap implementations (e.g. solsight-executor) without touching
 * controllers, DTOs, or feature services.
 */
export type QuoteParams = JupiterGetSwapQuoteParams;
export type QuoteResponse = JupiterQuoteResponse;
export interface SwapRequest extends JupiterSwapRequest {
    /**
     * solsight-executor extension: when set, the executor builds a gasless
     * transaction with Kora as fee payer and embeds the user→Kora fee-token
     * payment instruction. Must equal the swap's input or output mint.
     */
    feeToken?: string;
}
export type SwapResponse = JupiterSwapResponse;

export interface ExecutorService {
    /**
     * Fetch a swap quote for the given input/output mint pair.
     */
    getQuote(cluster: Cluster, params: QuoteParams): Promise<QuoteResponse>;

    /**
     * Build an unsigned swap transaction from a previously fetched quote.
     */
    getSwapTransaction(cluster: Cluster, params: SwapRequest): Promise<SwapResponse>;
}

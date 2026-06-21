/**
 * Thin JSON-RPC client for the Kora paymaster service.
 *
 * Speaks the Kora wire protocol directly via `fetch`. Replaces the
 * `@solana/kora` TypeScript SDK so the API runtime does not need to
 * dynamically import an ESM-only package from a CommonJS host.
 *
 * Wire types mirror `solsight-fee-validator/sdks/ts/src/types/index.ts`.
 * We control the fork, so contract drift is a non-issue.
 */

import { createHmac } from "crypto";
import {
    KoraClientOptions,
    KoraEstimateTransactionFeeRequest,
    KoraEstimateTransactionFeeResponse,
    KoraFetch,
    KoraGetPayerSignerResponse,
    KoraGetSupportedTokensResponse,
    KoraRpcResponse,
    KoraSignAndSendTransactionResponse,
    KoraSignTransactionRequest,
    KoraSignTransactionResponse
} from "./kora.types";

export class KoraClient {
    private readonly rpcUrl: string;
    private readonly apiKey?: string;
    private readonly hmacSecret?: string;
    private readonly fetchImpl: KoraFetch;

    constructor(options: KoraClientOptions) {
        this.rpcUrl = options.rpcUrl;
        this.apiKey = options.apiKey;
        this.hmacSecret = options.hmacSecret;
        this.fetchImpl = options.fetchImpl ?? ((input, init) => globalThis.fetch(input, init));
    }

    getPayerSigner(): Promise<KoraGetPayerSignerResponse> {
        return this.rpc<KoraGetPayerSignerResponse>("getPayerSigner");
    }

    getSupportedTokens(): Promise<KoraGetSupportedTokensResponse> {
        return this.rpc<KoraGetSupportedTokensResponse>("getSupportedTokens");
    }

    estimateTransactionFee(request: KoraEstimateTransactionFeeRequest): Promise<KoraEstimateTransactionFeeResponse> {
        return this.rpc<KoraEstimateTransactionFeeResponse>("estimateTransactionFee", request);
    }

    signTransaction(request: KoraSignTransactionRequest): Promise<KoraSignTransactionResponse> {
        return this.rpc<KoraSignTransactionResponse>("signTransaction", request);
    }

    signAndSendTransaction(request: KoraSignTransactionRequest): Promise<KoraSignAndSendTransactionResponse> {
        return this.rpc<KoraSignAndSendTransactionResponse>("signAndSendTransaction", request);
    }

    private async rpc<T>(method: string, params?: unknown): Promise<T> {
        const body = JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method,
            params: params ?? null
        });

        const headers: Record<string, string> = {
            "Content-Type": "application/json"
        };

        if (this.apiKey) {
            headers["x-api-key"] = this.apiKey;
        }

        if (this.hmacSecret) {
            const timestamp = Math.floor(Date.now() / 1000).toString();
            const signature = createHmac("sha256", this.hmacSecret)
                .update(timestamp + body)
                .digest("hex");
            headers["x-timestamp"] = timestamp;
            headers["x-hmac-signature"] = signature;
        }

        const response = await this.fetchImpl(this.rpcUrl, {
            method: "POST",
            headers,
            body
        });

        const json: KoraRpcResponse<T> = (await response.json()) as KoraRpcResponse<T>;

        if (json.error) {
            throw new Error(`Kora RPC ${method} failed: [${json.error.code}] ${json.error.message}`);
        }

        if (json.result === undefined) {
            throw new Error(`Kora RPC ${method} returned no result`);
        }

        return json.result;
    }
}

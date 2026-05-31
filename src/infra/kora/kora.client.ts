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

export interface KoraClientOptions {
    rpcUrl: string;
    apiKey?: string;
    hmacSecret?: string;
    fetchImpl?: typeof fetch;
}

export interface KoraGetPayerSignerResponse {
    payment_address: string;
    signer_address: string;
}

export interface KoraGetSupportedTokensResponse {
    tokens: string[];
}

export interface KoraEstimateTransactionFeeRequest {
    transaction: string;
    fee_token?: string;
    sig_verify?: boolean;
    signer_key?: string;
}

export interface KoraEstimateTransactionFeeResponse {
    fee_in_lamports: number;
    fee_in_token?: number;
    payment_address: string;
    signer_pubkey: string;
}

export interface KoraSignTransactionRequest {
    transaction: string;
    sig_verify?: boolean;
    signer_key?: string;
    user_id?: string;
}

export interface KoraSignTransactionResponse {
    signed_transaction: string;
    signer_pubkey: string;
}

interface RpcError {
    code: number;
    message: string;
}

interface RpcResponse<T> {
    jsonrpc: "2.0";
    id: number;
    result?: T;
    error?: RpcError;
}

export class KoraClient {
    private readonly rpcUrl: string;
    private readonly apiKey?: string;
    private readonly hmacSecret?: string;
    private readonly fetchImpl: typeof fetch;

    constructor(options: KoraClientOptions) {
        this.rpcUrl = options.rpcUrl;
        this.apiKey = options.apiKey;
        this.hmacSecret = options.hmacSecret;
        this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
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

        const json = (await response.json()) as RpcResponse<T>;

        if (json.error) {
            throw new Error(`Kora RPC ${method} failed: [${json.error.code}] ${json.error.message}`);
        }

        if (json.result === undefined) {
            throw new Error(`Kora RPC ${method} returned no result`);
        }

        return json.result;
    }
}

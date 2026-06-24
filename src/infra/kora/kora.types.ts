/**
 * Service-level types for the Kora paymaster wrapper.
 *
 * Inputs/outputs are camelCased at the NestJS boundary; the in-house
 * Kora client (kora.client.ts) handles the snake_case wire format.
 *
 * `getPaymentInstruction` returns a `@solana/web3.js` `TransactionInstruction`
 * directly: the wrapper composes the fee estimate + ATA derivation + transfer
 * instruction client-side, so swap-module consumers can append the result to
 * an existing `VersionedTransaction` with no further bridging.
 */

import type { TransactionInstruction } from "@solana/web3.js";

export type KoraFetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface KoraClientOptions {
    rpcUrl: string;
    apiKey?: string;
    hmacSecret?: string;
    fetchImpl?: KoraFetch;
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

export interface KoraRpcError {
    code: number;
    message: string;
}

export interface KoraRpcResponse<T> {
    jsonrpc: "2.0";
    id: number;
    result?: T;
    error?: KoraRpcError;
}

export interface KoraEstimateFeeResult {
    feeInLamports: number;
    feeInToken: number | null;
    paymentAddress: string;
    signerPubkey: string;
}

export interface KoraSignTransactionResult {
    signedTransaction: string;
    signerPubkey: string;
}

export interface KoraSignTransactionInput {
    transaction: string;
    signerKey?: string;
}

export interface KoraGetPaymentInstructionInput {
    transaction: string;
    feeToken: string;
    sourceWallet: string;
}

export interface KoraPaymentInstructionResult {
    paymentAddress: string;
    paymentToken: string;
    paymentAmount: number;
    signerAddress: string;
    paymentInstruction: TransactionInstruction;
}

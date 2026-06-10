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

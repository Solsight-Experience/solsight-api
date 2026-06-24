import { Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, createTransferInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { KoraClient } from "./kora.client";
import type {
    KoraEstimateFeeResult,
    KoraGetPaymentInstructionInput,
    KoraPaymentInstructionResult,
    KoraSignAndSendTransactionResult,
    KoraSignTransactionInput,
    KoraSignTransactionResult
} from "./kora.types";

@Injectable()
export class KoraService {
    private readonly logger = new Logger(KoraService.name);
    private readonly rpcUrl?: string;
    private readonly apiKey?: string;
    private readonly hmacSecret?: string;

    private client?: KoraClient;

    constructor(private readonly configService: ConfigService) {
        this.rpcUrl = this.configService.get<string>("kora.rpcUrl");
        this.apiKey = this.configService.get<string>("kora.apiKey");
        this.hmacSecret = this.configService.get<string>("kora.hmacSecret");

        if (this.rpcUrl) {
            const host = this.safeHostname(this.rpcUrl);
            this.logger.log(`Kora paymaster enabled (host=${host})`);
        } else {
            this.logger.log("Kora paymaster disabled (KORA_RPC_URL not set)");
        }
    }

    isEnabled(): boolean {
        return Boolean(this.rpcUrl);
    }

    async getSupportedTokens(): Promise<string[]> {
        if (!this.isEnabled()) {
            return [];
        }
        try {
            const response = await this.getClient().getSupportedTokens();
            return response.tokens ?? [];
        } catch (error) {
            this.throwWrapped("getSupportedTokens", error);
        }
    }

    async getPayerPubkey(): Promise<string | null> {
        if (!this.isEnabled()) {
            return null;
        }
        try {
            const response = await this.getClient().getPayerSigner();
            return response.signer_address;
        } catch (error) {
            this.throwWrapped("getPayerSigner", error);
        }
    }

    async estimateTransactionFee(transactionBase64: string, feeToken: string): Promise<KoraEstimateFeeResult> {
        this.requireEnabled("estimateTransactionFee");
        try {
            const response = await this.getClient().estimateTransactionFee({
                transaction: transactionBase64,
                fee_token: feeToken
            });
            return {
                feeInLamports: response.fee_in_lamports,
                feeInToken: response.fee_in_token ?? null,
                paymentAddress: response.payment_address,
                signerPubkey: response.signer_pubkey
            };
        } catch (error) {
            this.throwWrapped("estimateTransactionFee", error);
        }
    }

    /**
     * Composes the fee estimate + ATA derivation + transfer instruction
     * client-side. Mirrors the SDK's `getPaymentInstruction` helper but
     * returns a `@solana/web3.js` `TransactionInstruction` directly so
     * callers can append it to a `VersionedTransaction` with no kit-bridge
     * code in between.
     */
    async getPaymentInstruction(input: KoraGetPaymentInstructionInput): Promise<KoraPaymentInstructionResult> {
        this.requireEnabled("getPaymentInstruction");
        try {
            const estimate = await this.getClient().estimateTransactionFee({
                transaction: input.transaction,
                fee_token: input.feeToken
            });

            if (estimate.fee_in_token === undefined || estimate.fee_in_token === null) {
                throw new Error("Fee token was specified but fee_in_token was not returned from server");
            }

            const feeMint = new PublicKey(input.feeToken);
            const sourceOwner = new PublicKey(input.sourceWallet);
            const paymentOwner = new PublicKey(estimate.payment_address);

            const sourceAta = getAssociatedTokenAddressSync(feeMint, sourceOwner, true, TOKEN_PROGRAM_ID);
            const destinationAta = getAssociatedTokenAddressSync(feeMint, paymentOwner, true, TOKEN_PROGRAM_ID);

            const paymentInstruction = createTransferInstruction(sourceAta, destinationAta, sourceOwner, BigInt(estimate.fee_in_token), [], TOKEN_PROGRAM_ID);

            return {
                paymentAddress: estimate.payment_address,
                paymentToken: input.feeToken,
                paymentAmount: estimate.fee_in_token,
                signerAddress: estimate.signer_pubkey,
                paymentInstruction
            };
        } catch (error) {
            this.throwWrapped("getPaymentInstruction", error);
        }
    }

    async signTransaction(input: KoraSignTransactionInput): Promise<KoraSignTransactionResult> {
        this.requireEnabled("signTransaction");
        try {
            const response = await this.getClient().signTransaction({
                transaction: input.transaction,
                signer_key: input.signerKey
            });
            return {
                signedTransaction: response.signed_transaction,
                signerPubkey: response.signer_pubkey
            };
        } catch (error) {
            this.throwWrapped("signTransaction", error);
        }
    }

    async signAndSendTransaction(input: KoraSignTransactionInput): Promise<KoraSignAndSendTransactionResult> {
        this.requireEnabled("signAndSendTransaction");
        try {
            const response = await this.getClient().signAndSendTransaction({
                transaction: input.transaction,
                signer_key: input.signerKey
            });
            return {
                signature: response.signature,
                signedTransaction: response.signed_transaction
            };
        } catch (error) {
            this.throwWrapped("signAndSendTransaction", error);
        }
    }

    private getClient(): KoraClient {
        if (!this.rpcUrl) {
            throw new InternalServerErrorException("Kora is not configured");
        }
        if (!this.client) {
            this.client = new KoraClient({
                rpcUrl: this.rpcUrl,
                apiKey: this.apiKey,
                hmacSecret: this.hmacSecret
            });
        }
        return this.client;
    }

    private requireEnabled(method: string): void {
        if (!this.isEnabled()) {
            throw new InternalServerErrorException(`Kora paymaster is not enabled; cannot call ${method}. Set KORA_RPC_URL to enable.`);
        }
    }

    private throwWrapped(method: string, error: unknown): never {
        const message = error instanceof Error ? error.message : String(error);
        const isNetwork = this.isNetworkError(error);
        const prefix = isNetwork ? "Kora paymaster network error" : "Kora paymaster RPC error";
        this.logger.error(`${prefix} in ${method}: ${message}`);
        throw new InternalServerErrorException(`${prefix} in ${method}: ${message}`);
    }

    private isNetworkError(error: unknown): boolean {
        if (!error || typeof error !== "object") {
            return false;
        }
        const candidate = error as { name?: string; code?: string; cause?: { code?: string } };
        const code = candidate.code ?? candidate.cause?.code;
        return (
            candidate.name === "FetchError" ||
            candidate.name === "AbortError" ||
            candidate.name === "TypeError" ||
            code === "ECONNREFUSED" ||
            code === "ENOTFOUND" ||
            code === "ETIMEDOUT" ||
            code === "ECONNRESET" ||
            code === "UND_ERR_CONNECT_TIMEOUT" ||
            code === "UND_ERR_SOCKET"
        );
    }

    private safeHostname(url: string): string {
        try {
            return new URL(url).host;
        } catch {
            return "<invalid-url>";
        }
    }
}

import { Injectable, Logger } from "@nestjs/common";
import { AddressLookupTableAccount, Commitment, LAMPORTS_PER_SOL, PublicKey, RecentPrioritizationFees } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { HeliusResolver } from "./helius.resolver";
import { ClusterProvider } from "../../common/cluster/cluster.provider";
import { SubmitAndConfirmOptions } from "./constants/types";
import { ParsedTokenAccount } from "./solana.types";

@Injectable()
export class SolanaService {
    private readonly logger = new Logger(SolanaService.name);

    constructor(
        private readonly heliusResolver: HeliusResolver,
        private readonly clusterProvider: ClusterProvider
    ) {}

    getNetwork(): string {
        return this.clusterProvider.cluster;
    }

    async getBalance(publicKey: PublicKey): Promise<number> {
        try {
            const balance = await this.heliusResolver.get().getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            this.logger.error(`Failed to get balance for ${publicKey.toString()}`, error);
            throw error;
        }
    }

    async getTokenBalance(walletAddress: PublicKey, mintAddress: PublicKey): Promise<number> {
        try {
            const tokenAccount = await getAssociatedTokenAddress(mintAddress, walletAddress);
            const tokenBalance = await this.heliusResolver.get().getTokenAccountBalance(tokenAccount);
            return tokenBalance.value.uiAmount || 0;
        } catch (error) {
            this.logger.error(`Failed to get token balance`, error);
            return 0;
        }
    }

    async getParsedTokenAccountsByOwner(owner: PublicKey): Promise<ParsedTokenAccount[]> {
        try {
            const result = await this.heliusResolver.get().getParsedTokenAccountsByOwner(owner, {
                programId: TOKEN_PROGRAM_ID
            });
            return result.value as ParsedTokenAccount[];
        } catch (error) {
            this.logger.error(`Failed to get parsed token accounts for ${owner.toString()}`, error);
            throw error;
        }
    }

    async getMintDecimals(mintAddress: string): Promise<number | null> {
        try {
            const result = await this.heliusResolver.get().getParsedAccountInfo(new PublicKey(mintAddress));
            const data = result.value?.data;

            if (!data || typeof data === "string" || !("parsed" in data)) {
                return null;
            }

            const decimals = (data.parsed as { info?: { decimals?: unknown } }).info?.decimals;
            return typeof decimals === "number" ? decimals : null;
        } catch (error) {
            this.logger.debug(`Failed to get mint decimals for ${mintAddress}: ${(error as Error).message}`);
            return null;
        }
    }

    async getTransactionHistory(publicKey: PublicKey, limit = 10, before?: string, until?: string) {
        try {
            const rpc = this.heliusResolver.get();
            const options = { limit, before, until };
            const signatures = await rpc.getSignaturesForAddress(publicKey, options);
            const transactions = await Promise.all(
                signatures.map(async (sig) => {
                    const tx = await rpc.getTransaction(sig.signature, {
                        maxSupportedTransactionVersion: 0
                    });
                    return {
                        signature: sig.signature,
                        slot: sig.slot,
                        blockTime: sig.blockTime,
                        transaction: tx
                    };
                })
            );
            return transactions;
        } catch (error) {
            this.logger.error(`Failed to get transaction history for ${publicKey.toString()}`, error);
            throw error;
        }
    }

    validatePublicKey(publicKeyString: string): boolean {
        try {
            new PublicKey(publicKeyString);
            return true;
        } catch {
            return false;
        }
    }

    async submitAndConfirm(signedTransactionBase64: string, options: SubmitAndConfirmOptions = {}): Promise<{ signature: string }> {
        const rpc = this.heliusResolver.get();
        const txBuffer = Buffer.from(signedTransactionBase64, "base64");
        const commitment = options.commitment ?? "confirmed";
        const latestBlockhash = await rpc.getLatestBlockhash(commitment);

        const signature = await rpc.sendRawTransaction(txBuffer, {
            skipPreflight: options.skipPreflight ?? false,
            maxRetries: options.maxRetries ?? 3,
            preflightCommitment: commitment
        });
        await rpc.confirmTransaction(
            {
                signature,
                blockhash: latestBlockhash.blockhash,
                lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
            },
            commitment
        );
        return { signature };
    }

    async confirmSignature(signature: string, commitment: Commitment = "confirmed"): Promise<void> {
        await this.heliusResolver.get().confirmTransaction(signature, commitment);
    }

    async getRecentPrioritizationFees(): Promise<RecentPrioritizationFees[]> {
        return this.heliusResolver.get().getRecentPrioritizationFees();
    }

    async resolveAddressLookupTables(accountKeys: PublicKey[]): Promise<AddressLookupTableAccount[]> {
        if (accountKeys.length === 0) {
            return [];
        }
        const rpc = this.heliusResolver.get();
        return Promise.all(
            accountKeys.map(async (key) => {
                const result = await rpc.getAddressLookupTable(key);
                if (!result.value) {
                    throw new Error(`Address lookup table not found: ${key.toBase58()}`);
                }
                return result.value;
            })
        );
    }
}

import { Injectable, Logger } from "@nestjs/common";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { HeliusResolver } from "./helius.resolver";
import { ClusterProvider } from "../../common/cluster/cluster.provider";

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

    async getParsedTokenAccountsByOwner(owner: PublicKey) {
        try {
            const result = await this.heliusResolver.get().getParsedTokenAccountsByOwner(owner, {
                programId: TOKEN_PROGRAM_ID
            });
            return result.value;
        } catch (error) {
            this.logger.error(`Failed to get parsed token accounts for ${owner.toString()}`, error);
            throw error;
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
}

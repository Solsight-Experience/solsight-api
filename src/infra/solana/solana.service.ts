import { Inject, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Commitment, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress } from "@solana/spl-token";
import { SOLANA_RPC_SERVICE } from "./constants/solana.token";
import { SolanaRpcService } from "./interfaces/solana-rpc-service.interface";

@Injectable()
export class SolanaService {
    private readonly logger = new Logger(SolanaService.name);
    private readonly network: string;

    constructor(
        private readonly configService: ConfigService,
        @Inject(SOLANA_RPC_SERVICE) private readonly rpcService: SolanaRpcService
    ) {
        const rpcUrl = this.configService.get<string>("solana.rpcUrl");
        if (!rpcUrl) {
            throw new Error("Solana RPC URL is required");
        }

        const commitment = this.configService.get<Commitment>("solana.commitment");

        const network = this.configService.get<string>("solana.network");
        if (!network) {
            throw new Error("Solana network is required");
        }
        this.network = network;

        this.logger.log(`Connected to Solana ${this.network} network`);
    }

    getNetwork(): string {
        return this.network;
    }

    async getBalance(publicKey: PublicKey): Promise<number> {
        try {
            const balance = await this.rpcService.getBalance(publicKey);
            return balance / LAMPORTS_PER_SOL;
        } catch (error) {
            this.logger.error(`Failed to get balance for ${publicKey.toString()}`, error);
            throw error;
        }
    }

    async getTokenBalance(walletAddress: PublicKey, mintAddress: PublicKey): Promise<number> {
        try {
            const tokenAccount = await getAssociatedTokenAddress(mintAddress, walletAddress);
            const tokenBalance = await this.rpcService.getTokenAccountBalance(tokenAccount);
            return tokenBalance.value.uiAmount || 0;
        } catch (error) {
            this.logger.error(`Failed to get token balance`, error);
            return 0;
        }
    }

    async getParsedTokenAccountsByOwner(owner: PublicKey) {
        try {
            const result = await this.rpcService.getParsedTokenAccountsByOwner(owner, {
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
            const options = { limit, before, until };
            const signatures = await this.rpcService.getSignaturesForAddress(publicKey, options);
            const transactions = await Promise.all(
                signatures.map(async (sig) => {
                    const tx = await this.rpcService.getTransaction(sig.signature, {
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

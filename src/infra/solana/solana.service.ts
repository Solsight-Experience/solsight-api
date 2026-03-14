import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, PublicKey, Keypair, Transaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';

@Injectable()
export class SolanaService {
  private readonly logger = new Logger(SolanaService.name);
  private connection: Connection;
  private readonly network: string;
  private heliusConnection: Connection;

  constructor(private configService: ConfigService) {
    const rpcUrl = this.configService.get<string>('solana.rpcUrl');
    if (!rpcUrl) {
      throw new Error('Solana RPC URL is required');
    }

    const heliusRpcUrl = this.configService.get<string>('solana.heliusRpcUrl');
    if (!heliusRpcUrl) {
      throw new Error('Helius RPC URL is required');
    }

    const commitment = this.configService.get<string>('solana.commitment') as any;

    const network = this.configService.get<string>('solana.network');
    if (!network) {
      throw new Error('Solana network is required');
    }
    this.network = network;

    this.connection = new Connection(rpcUrl, commitment);
    this.heliusConnection = new Connection(heliusRpcUrl, commitment);

    this.logger.log(`Connected to Solana ${this.network} network`);
  }

  getConnection(): Connection {
    return this.connection;
  }

  getHeliusConnection(): Connection {
    return this.heliusConnection;
  }

  getHeliusApiKey(): string | undefined {
    return this.configService.get<string>('solana.heliusApiKey');
  }

  getNetwork(): string {
    return this.network;
  }

  getHeliusBaseUrl(): string {
    return this.network === 'devnet' ? 'https://api-devnet.helius.xyz' : 'https://api.helius.xyz';
  }

  getProgramId(): PublicKey | undefined {
    return this.programId;
  }

  async getBalance(publicKey: PublicKey, useHelius = false): Promise<number> {
    const conn = useHelius ? this.heliusConnection : this.connection;
    try {
      const balance = await conn.getBalance(publicKey);
      return balance / LAMPORTS_PER_SOL;
    } catch (error) {
      this.logger.error(`Failed to get balance for ${publicKey.toString()}`, error);
      throw error;
    }
  }

  async getTokenBalance(walletAddress: PublicKey, mintAddress: PublicKey): Promise<number> {
    try {
      const tokenAccount = await getAssociatedTokenAddress(mintAddress, walletAddress);
      const tokenBalance = await this.connection.getTokenAccountBalance(tokenAccount);
      return tokenBalance.value.uiAmount || 0;
    } catch (error) {
      this.logger.error(`Failed to get token balance`, error);
      return 0;
    }
  }

  async getParsedTokenAccountsByOwner(owner: PublicKey, useHelius = false) {
    const conn = useHelius ? this.heliusConnection : this.connection;
    try {
      const result = await conn.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      });
      return result.value;
    } catch (error) {
      this.logger.error(`Failed to get parsed token accounts for ${owner.toString()}`, error);
      throw error;
    }
  }

  async getTransactionHistory(
    publicKey: PublicKey,
    limit = 10,
    before?: string,
    until?: string,
    useHelius: boolean = false,
  ) {
    const conn = useHelius ? this.heliusConnection : this.connection;
    try {
      const options = { limit, before, until };
      const signatures = await conn.getSignaturesForAddress(publicKey, options);
      const transactions = await Promise.all(
        signatures.map(async (sig) => {
          const tx = await conn.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          });
          return {
            signature: sig.signature,
            slot: sig.slot,
            blockTime: sig.blockTime,
            transaction: tx,
          };
        }),
      );
      return transactions;
    } catch (error) {
      this.logger.error(`Failed to get transaction history for ${publicKey.toString()}`, error);
      throw error;
    }
  }

  async sendTransaction(transaction: Transaction, signers: Keypair[]): Promise<string> {
    try {
      const signature = await this.connection.sendTransaction(transaction, signers);
      await this.connection.confirmTransaction(signature);
      this.logger.log(`Transaction sent successfully: ${signature}`);
      return signature;
    } catch (error) {
      this.logger.error('Failed to send transaction', error);
      throw error;
    }
  }

  async createAssociatedTokenAccount(payer: PublicKey, owner: PublicKey, mint: PublicKey): Promise<PublicKey> {
    try {
      const associatedTokenAddress = await getAssociatedTokenAddress(mint, owner);

      // const transaction = new Transaction().add(
      //   createAssociatedTokenAccountInstruction(
      //     payer,
      //     associatedTokenAddress,
      //     owner,
      //     mint,
      //     TOKEN_PROGRAM_ID,
      //   ),
      // );

      return associatedTokenAddress;
    } catch (error) {
      this.logger.error('Failed to create associated token account', error);
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

  async getLatestBlockhash() {
    return await this.connection.getLatestBlockhash();
  }

  async simulateTransaction(transaction: Transaction) {
    return await this.connection.simulateTransaction(transaction);
  }
}

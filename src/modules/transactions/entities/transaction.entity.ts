import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne } from 'typeorm';
import { Wallet } from '../../wallets/entities/wallet.entity';

export enum TransactionType {
  TRANSFER = 'transfer',
  SWAP = 'swap',
  STAKE = 'stake',
  UNSTAKE = 'unstake',
  TOKEN_TRANSFER = 'token_transfer',
}

export enum TransactionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('transactions')
export class Transaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  signature: string;

  @Column({
    type: 'enum',
    enum: TransactionType,
  })
  type: TransactionType;

  @Column({
    type: 'enum',
    enum: TransactionStatus,
    default: TransactionStatus.PENDING,
  })
  status: TransactionStatus;

  @Column({ type: 'decimal', precision: 20, scale: 9 })
  amount: number;

  @Column({ nullable: true })
  tokenMint?: string;

  @Column({ type: 'decimal', precision: 20, scale: 9, nullable: true })
  fee?: number;

  @Column({ nullable: true })
  blockNumber?: number;

  @Column({ nullable: true })
  blockTime?: Date;

  @Column({ type: 'text', nullable: true })
  memo?: string;

  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Wallet, (wallet) => wallet.sentTransactions, {
    onDelete: 'CASCADE',
  })
  fromWallet: Wallet;

  @Column()
  fromWalletId: string;

  @ManyToOne(() => Wallet, (wallet) => wallet.receivedTransactions, {
    onDelete: 'CASCADE',
  })
  toWallet: Wallet;

  @Column()
  toWalletId: string;
}

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { WatchedWallet } from './watched-wallet.entity';

export enum WalletAlertType {
  ANY_SWAP = 'any_swap',
  TOKEN_BALANCE_CHANGE = 'token_balance_change',
  LARGE_TRANSFER = 'large_transfer',
}

export interface WalletAlertCondition {
  // TOKEN_BALANCE_CHANGE
  tokenMint?: string;
  tokenSymbol?: string;
  threshold?: number;
  thresholdType?: 'amount' | 'percentage';
  direction?: 'increase' | 'decrease' | 'any';
  // LARGE_TRANSFER
  minAmountSol?: number;
}

@Entity('wallet_alerts')
@Index(['userId', 'walletAddress'])
@Index(['isActive'])
export class WalletAlert {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @Column()
  walletAddress: string;

  @Column({ type: 'enum', enum: WalletAlertType })
  alertType: WalletAlertType;

  @Column({ type: 'json', nullable: true })
  condition?: WalletAlertCondition;

  @Column({ default: true })
  isActive: boolean;

  /** Signature of the most recent tx we processed — null means not yet initialized */
  @Column({ type: 'varchar', nullable: true })
  lastCheckedSignature?: string;

  @ManyToOne(() => WatchedWallet, { onDelete: 'CASCADE' })
  watchedWallet: WatchedWallet;

  @Column()
  watchedWalletId: string;

  @CreateDateColumn()
  createdAt: Date;
}

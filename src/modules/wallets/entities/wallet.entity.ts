import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Transaction } from '../../transactions/entities/transaction.entity';

export enum WalletType {
  SOLANA = 'solana',
  PHANTOM = 'phantom',
  SOLFLARE = 'solflare',
  BACKPACK = 'backpack',
}

export enum WalletIcon {
  SOLSIGHT = 'solsight',
  PHANTOM = 'phantom',
  METAMASK = 'metamask',
  WALLETCONNECT = 'walletconnect',
  CUSTOM = 'custom',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', unique: true })
  address: string;

  @Column({ type: 'varchar', default: 'SOL' })
  chain: string;

  @Column({ type: 'text', nullable: true })
  nonce: string | null;

  @Column({
    type: 'enum',
    enum: WalletType,
    default: WalletType.SOLANA,
  })
  type: WalletType;

  @Column({ type: 'varchar', nullable: true })
  name?: string;

  @Column({ default: true })
  isActive: boolean;

  @Column({ default: false })
  isVerified: boolean;

  @Column({
    type: 'enum',
    enum: WalletIcon,
    nullable: true,
  })
  icon?: WalletIcon;

  @Column({ default: false })
  isDefault: boolean;

  @Column({ default: false })
  isConnected: boolean;

  @Column({ type: 'decimal', precision: 20, scale: 9, default: 0 })
  balance: number;

  @Column({ type: 'varchar', nullable: true })
  publicKey?: string;

  @Column({ type: 'varchar', nullable: true, select: false })
  encryptedPrivateKey?: string;

  @Column({ type: 'varchar', nullable: true })
  derivationPath?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.wallets, {
    onDelete: 'CASCADE',
    nullable: true,
  })
  user: User;

  @Column({ type: 'varchar', nullable: true })
  userId: string;

  @OneToMany(() => Transaction, (transaction) => transaction.fromWallet)
  sentTransactions: Transaction[];

  @OneToMany(() => Transaction, (transaction) => transaction.toWallet)
  receivedTransactions: Transaction[];
}

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
  BACKPACK = 'backpack',
  COINBASE = 'coinbase',
  CUSTOM = 'custom',
}

@Entity('wallets')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  address: string;

  @Column({
    type: 'enum',
    enum: WalletType,
    default: WalletType.SOLANA,
  })
  type: WalletType;

  @Column({ nullable: true })
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

  @Column({ nullable: true })
  publicKey?: string;

  @Column({ nullable: true, select: false })
  encryptedPrivateKey?: string;

  @Column({ nullable: true })
  derivationPath?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.wallets, { onDelete: 'CASCADE' })
  user: User;

  @Column()
  userId: string;

  @OneToMany(() => Transaction, (transaction) => transaction.fromWallet)
  sentTransactions: Transaction[];

  @OneToMany(() => Transaction, (transaction) => transaction.toWallet)
  receivedTransactions: Transaction[];
}

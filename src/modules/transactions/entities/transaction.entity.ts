import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, Index } from "typeorm";
import { Wallet } from "../../wallets/entities/wallet.entity";
import { JsonValue } from "../../../common/types";
import { TokenTransfer } from "../../../infra/solana/constants/types";

export type TransactionMetadata = Record<string, JsonValue | TokenTransfer[] | undefined>;

export enum TransactionType {
    TRANSFER = "transfer",
    SWAP = "swap",
    STAKE = "stake",
    UNSTAKE = "unstake",
    TOKEN_TRANSFER = "token_transfer"
}

export enum TransactionStatus {
    PENDING = "pending",
    CONFIRMED = "confirmed",
    FAILED = "failed",
    CANCELLED = "cancelled"
}

@Entity("transactions")
@Index(["signature", "network"], { unique: true })
export class Transaction {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ unique: true })
    signature: string;

    @Column({ default: "mainnet" })
    network: string;

    @Column({
        type: "enum",
        enum: TransactionType
    })
    type: TransactionType;

    @Column({
        type: "enum",
        enum: TransactionStatus,
        default: TransactionStatus.PENDING
    })
    status: TransactionStatus;

    @Column({ type: "decimal", precision: 30, scale: 9 })
    amount: number;

    @Column({ nullable: true })
    tokenMint?: string | null;

    @Column({ nullable: true })
    tokenMintOut?: string | null;

    @Column({ type: "decimal", precision: 30, scale: 9, nullable: true })
    amountOut?: number | null;

    @Column({ type: "decimal", precision: 30, scale: 9, nullable: true })
    fee?: number;

    @Column({ type: "bigint", nullable: true })
    blockNumber?: string;

    @Column({ nullable: true })
    blockTime?: Date;

    @Column({ nullable: true })
    signerAddress?: string | null;

    @Column({ type: "text", nullable: true })
    memo?: string | null;

    @Column({ type: "json", nullable: true })
    metadata?: TransactionMetadata;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;

    @ManyToOne(() => Wallet, (wallet) => wallet.sentTransactions, {
        nullable: true,
        onDelete: "SET NULL"
    })
    fromWallet?: Wallet;

    @Column({ nullable: true })
    fromWalletId?: string;

    @ManyToOne(() => Wallet, (wallet) => wallet.receivedTransactions, {
        nullable: true,
        onDelete: "SET NULL"
    })
    toWallet?: Wallet;

    @Column({ nullable: true })
    toWalletId?: string;
}

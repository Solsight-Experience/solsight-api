import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

@Entity("wallet_snapshots")
@Index(["walletAddress", "network", "snapshotAt"])
export class WalletSnapshot {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    walletAddress: string;

    @Column({ default: "mainnet" })
    network: string;

    @Column()
    tokenMint: string;

    @Column({ nullable: true })
    tokenSymbol?: string;

    @Column({ nullable: true })
    tokenName?: string;

    @Column({ type: "decimal", precision: 30, scale: 9 })
    amount: number;

    @Column({ type: "decimal", precision: 30, scale: 9, nullable: true })
    price?: number;

    @Column({ type: "decimal", precision: 30, scale: 9, nullable: true })
    valueUsd?: number;

    @Column({ name: "snapshot_at" })
    snapshotAt: Date;
}

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

@Entity("swap_trades")
@Index(["walletAddress", "network", "timestamp"])
@Index(["signature", "network"], { unique: true })
export class SwapTrade {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    walletAddress: string;

    @Column({ default: "mainnet" })
    network: string;

    @Column({ unique: true })
    signature: string;

    @Column({ type: "bigint" })
    timestamp: number;

    @Column({ type: "json" })
    tokenTransfers: any[];

    @Column({ type: "text", nullable: true })
    description: string;

    @Column({ default: "SWAP" })
    type: string;

    @CreateDateColumn()
    createdAt: Date;
}

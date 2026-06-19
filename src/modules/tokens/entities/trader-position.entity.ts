import { Entity, PrimaryGeneratedColumn, Column, Index, Unique, UpdateDateColumn, CreateDateColumn } from "typeorm";

@Entity("trader_positions")
@Unique(["walletAddress", "tokenMint"])
@Index(["tokenMint", "totalVolume"])
@Index(["tokenMint", "realizedPnl"])
export class TraderPosition {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    walletAddress: string;

    @Column()
    tokenMint: string;

    @Column({ default: "mainnet" })
    network: string;

    @Column({ type: "decimal", precision: 30, scale: 9, default: 0 })
    totalBoughtUsd: number;

    @Column({ type: "decimal", precision: 30, scale: 9, default: 0 })
    totalSoldUsd: number;

    @Column({ type: "decimal", precision: 30, scale: 9, default: 0 })
    tokensHeld: number;

    @Column({ type: "decimal", precision: 30, scale: 9, default: 0 })
    costBasisUsd: number;

    @Column({ type: "decimal", precision: 30, scale: 9, default: 0 })
    realizedPnl: number;

    @Column({ type: "decimal", precision: 30, scale: 9, default: 0 })
    totalVolume: number;

    @Column({ type: "int", default: 0 })
    winTrades: number;

    @Column({ type: "int", default: 0 })
    totalSellTrades: number;

    @Column({ type: "int", default: 0 })
    tradesCount: number;

    @UpdateDateColumn()
    updatedAt: Date;

    @CreateDateColumn()
    createdAt: Date;
}

import { Column, Entity, Index, PrimaryGeneratedColumn, Unique } from "typeorm";

@Entity("holders")
@Unique(["tokenMint", "network", "wallet"])
@Index(["tokenMint", "network", "balance"])
export class Holder {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column()
    tokenMint: string;

    @Column({ default: "mainnet" })
    network: string;

    @Column()
    wallet: string;

    @Column({ type: "decimal", precision: 40, scale: 0 })
    balance: string;

    @Column({ type: "bigint" })
    lastActiveSlot: number;

    @Column({ type: "bigint" })
    lastActiveTs: number;

    @Column({ type: "decimal", precision: 40, scale: 0, default: "0" })
    totalBoughtRaw: string;

    @Column({ type: "decimal", precision: 40, scale: 0, default: "0" })
    totalSoldRaw: string;

    @Column({ type: "double precision", default: 0 })
    totalBoughtUsd: number;

    @Column({ type: "double precision", default: 0 })
    totalSoldUsd: number;

    @Column({ default: 0 })
    buyTxCount: number;

    @Column({ default: 0 })
    sellTxCount: number;

    @Column({ type: "bigint" })
    updatedAt: number;
}

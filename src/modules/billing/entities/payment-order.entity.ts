import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";
import type { Cluster } from "../../../common/cluster/cluster.types";

export enum PaymentOrderStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    EXPIRED = "expired",
    FAILED = "failed"
}

@Entity("payment_orders")
@Index(["status", "expiresAt"])
@Index(["userId", "createdAt"])
export class PaymentOrder {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    userId: string;

    @Column({ type: "varchar" })
    packageCode: string;

    @Column({ type: "int" })
    credits: number;

    @Column({ type: "bigint" })
    amountLamports: string;

    @Column({ type: "varchar", default: "mainnet" })
    network: Cluster;

    @Column({ type: "varchar", default: PaymentOrderStatus.PENDING })
    status: PaymentOrderStatus;

    @Column({ type: "varchar", unique: true, nullable: true })
    txSignature: string | null;

    @Column({ type: "varchar" })
    memo: string;

    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: "timestamp" })
    expiresAt: Date;

    @Column({ type: "timestamp", nullable: true })
    completedAt: Date | null;
}

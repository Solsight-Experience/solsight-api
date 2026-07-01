import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Unique } from "typeorm";
import { User } from "../../users/entities/user.entity";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Entity("watched_wallets")
@Unique(["userId", "walletAddress", "network"])
export class WatchedWallet {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    walletAddress: string;

    @Column({ type: "varchar" })
    userId: string;

    @Column({ type: "varchar", nullable: true })
    label?: string;

    @Column({ type: "varchar", default: "mainnet" })
    network: Cluster;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @CreateDateColumn()
    createdAt: Date;
}

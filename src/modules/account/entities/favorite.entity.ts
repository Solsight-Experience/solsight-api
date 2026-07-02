import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Unique } from "typeorm";
import { User } from "../../users/entities/user.entity";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Entity("favorites")
@Unique(["userId", "tokenAddress", "network"])
export class Favorite {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    userId: string;

    @Column({ type: "varchar" })
    tokenAddress: string;

    @Column({ type: "varchar", default: "mainnet" })
    network: Cluster;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @CreateDateColumn()
    createdAt: Date;
}

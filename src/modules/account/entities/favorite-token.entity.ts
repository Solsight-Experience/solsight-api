import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Unique } from "typeorm";
import { User } from "../../users/entities/user.entity";

@Entity("favorite_tokens")
@Unique(["userId", "tokenAddress", "network"])
export class FavoriteToken {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "uuid" })
    userId: string;

    @Column({ type: "varchar" })
    tokenAddress: string;

    @Column({ type: "varchar", default: "mainnet" })
    network: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @CreateDateColumn()
    createdAt: Date;
}

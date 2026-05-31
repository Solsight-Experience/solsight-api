import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, Unique } from "typeorm";
import { User } from "../../users/entities/user.entity";

@Entity("watched_wallets")
@Unique(["userId", "walletAddress"])
export class WatchedWallet {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    walletAddress: string;

    @Column({ type: "varchar" })
    userId: string;

    @Column({ type: "varchar", nullable: true })
    label?: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @CreateDateColumn()
    createdAt: Date;
}

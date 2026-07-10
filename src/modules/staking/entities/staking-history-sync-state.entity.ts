import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity("staking_history_sync_state")
@Index(["cluster", "stakeAccountAddress"], { unique: true })
export class StakingHistorySyncStateEntity {
    @PrimaryGeneratedColumn("uuid")
    declare id: string;

    @Column({ type: "varchar" })
    declare cluster: string;

    @Column({ type: "varchar" })
    declare walletAddress: string;

    @Column({ type: "varchar" })
    declare stakeAccountAddress: string;

    @Column({ type: "varchar", nullable: true })
    declare newestSyncedSignature: string | null;

    @Column({ type: "varchar", nullable: true })
    declare oldestSyncedSignature: string | null;

    @Column({ default: false })
    declare hasReachedOldestHistory: boolean;

    @Column({ type: "timestamp", nullable: true })
    declare lastSyncedAt: Date | null;

    @CreateDateColumn()
    declare createdAt: Date;

    @UpdateDateColumn()
    declare updatedAt: Date;
}

import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";
import { StakeActionType, StakeRecordStatus } from "../types/staking.types";

@Entity("staking_history")
@Index(["cluster", "stakeAccountAddress", "blockTime", "signature"])
@Index(["cluster", "walletAddress", "blockTime", "signature"])
@Index(["signature"], { unique: true })
export class StakingHistoryEntity {
    @PrimaryGeneratedColumn("uuid")
    declare id: string;

    @Column({ type: "varchar" })
    declare signature: string;

    @Column({ type: "varchar" })
    declare cluster: string;

    @Column({ type: "varchar" })
    declare walletAddress: string;

    @Column({ type: "varchar" })
    declare stakeAccountAddress: string;

    @Column({
        type: "enum",
        enum: ["stake_liquid", "unstake_liquid", "stake_native", "unstake_native", "withdraw_native"]
    })
    declare actionType: StakeActionType;

    @Column({
        type: "enum",
        enum: ["pending", "confirmed", "failed"]
    })
    declare status: StakeRecordStatus;

    @Column({ type: "varchar", nullable: true })
    declare voteAccount: string | null;

    @Column({ type: "decimal", precision: 30, scale: 9 })
    declare amountSol: string;

    @Column({ type: "bigint", nullable: true })
    declare slot: string | null;

    @Column({ type: "timestamptz" })
    declare blockTime: Date;

    @CreateDateColumn()
    declare createdAt: Date;

    @UpdateDateColumn()
    declare updatedAt: Date;
}

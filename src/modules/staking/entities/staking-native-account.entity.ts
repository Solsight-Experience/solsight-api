import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from "typeorm";

@Entity("staking_native_accounts")
@Index(["cluster", "walletAddress"])
@Index(["cluster", "address"], { unique: true })
export class StakingNativeAccountEntity {
    @PrimaryGeneratedColumn("uuid")
    declare id: string;

    @Column({ type: "varchar" })
    declare cluster: string;

    @Column({ type: "varchar" })
    declare walletAddress: string;

    @Column({ type: "varchar" })
    declare voteAccount: string;

    @Column({ type: "varchar" })
    declare seed: string;

    @Column({ type: "varchar" })
    declare address: string;

    @CreateDateColumn()
    declare createdAt: Date;
}

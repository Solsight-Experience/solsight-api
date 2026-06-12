import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from "typeorm";

@Entity("swap_executions")
@Index(["createdAt"])
@Index(["inputMint"])
export class SwapExecution {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ nullable: true, type: "varchar" })
    userId: string | null;

    @Column()
    walletAddress: string;

    @Column({ unique: true })
    signature: string;

    @Column()
    inputMint: string;

    @Column()
    outputMint: string;

    @Column({ type: "bigint" })
    inAmount: string;

    @Column({ type: "bigint" })
    outAmount: string;

    @Column({ type: "decimal", precision: 20, scale: 6, nullable: true })
    volumeUsd: number | null;

    @CreateDateColumn()
    createdAt: Date;
}

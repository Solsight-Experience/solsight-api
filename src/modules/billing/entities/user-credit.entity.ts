import { Entity, PrimaryColumn, Column, UpdateDateColumn } from "typeorm";

@Entity("user_credits")
export class UserCredit {
    @PrimaryColumn({ type: "varchar" })
    userId: string;

    @Column({ type: "int", default: 0 })
    balance: number;

    @UpdateDateColumn()
    updatedAt: Date;
}

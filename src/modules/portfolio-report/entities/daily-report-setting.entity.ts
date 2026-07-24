import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne } from "typeorm";
import { User } from "../../users/entities/user.entity";

export enum DailyReportChannel {
    TELEGRAM = "telegram",
    EMAIL = "email"
}

@Entity("daily_report_settings")
@Index(["userId"], { unique: true })
export class DailyReportSetting {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar" })
    userId: string;

    @ManyToOne(() => User, { onDelete: "CASCADE" })
    user: User;

    @Column({ default: false })
    enabled: boolean;

    @Column({ type: "enum", enum: DailyReportChannel, array: true, default: [DailyReportChannel.TELEGRAM] })
    channels: DailyReportChannel[];

    @Column({ type: "smallint", nullable: true })
    hourUtc: number | null;

    @Column({ type: "smallint", nullable: true })
    minuteUtc: number | null;

    @Column({ type: "varchar", nullable: true })
    lastSentDate: string | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

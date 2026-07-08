import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from "typeorm";
import { Wallet } from "../../wallets/entities/wallet.entity";

export enum UserRole {
    USER = "user",
    ADMIN = "admin"
}

@Entity("users")
export class User {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "varchar", unique: true, nullable: true })
    email?: string | null;

    @Column({ type: "varchar" })
    username: string;

    @Column({ type: "varchar", select: false })
    password?: string;

    @Column({ type: "varchar", nullable: true })
    firstName?: string;

    @Column({ type: "varchar", nullable: true })
    lastName?: string;

    @Column({ type: "varchar", nullable: true })
    avatar?: string;

    @Column({ type: "enum", enum: UserRole, default: UserRole.USER })
    role: UserRole;

    @Column({ default: true })
    isActive: boolean;

    @Column({ default: false })
    isEmailVerified: boolean;

    @Column({ type: "varchar", nullable: true })
    emailVerificationToken?: string | null;

    @Column({ type: "timestamp", nullable: true })
    emailVerificationTokenExpires?: Date | null;

    @Column({ type: "varchar", nullable: true })
    passwordResetToken?: string | null;

    @Column({ type: "timestamp", nullable: true })
    passwordResetExpires?: Date | null;
    @CreateDateColumn()
    createdAt: Date;

    @Column({ type: "varchar", length: 255, nullable: true })
    oauthProvider: string;
    @Column({ type: "varchar", length: 255, nullable: true })
    oauthId: string;

    @Column({ type: "timestamp", nullable: true })
    lastLoginAt?: Date | null;

    @Column({ type: "varchar", nullable: true })
    banReason?: string | null;

    @Column({ type: "text", nullable: true })
    adminNote?: string | null;

    @UpdateDateColumn()
    updatedAt: Date;

    @OneToMany(() => Wallet, (wallet) => wallet.user)
    wallets: Wallet[];
}

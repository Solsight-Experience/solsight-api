import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { User } from "../../users/entities/user.entity";
import { ChatMessage } from "./chat-message.entity";

@Entity("chat_sessions")
export class ChatSession {
    @PrimaryColumn("uuid")
    id: string;

    @Column({ type: "uuid", nullable: true })
    userId?: string;

    @ManyToOne(() => User, { nullable: true, onDelete: "SET NULL" })
    @JoinColumn({ name: "userId" })
    user?: User;

    @Column({ type: "varchar", length: 255, nullable: true })
    walletAddress?: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    title?: string;

    @OneToMany(() => ChatMessage, (message) => message.session)
    messages: ChatMessage[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}

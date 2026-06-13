import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from "typeorm";
import { ChatSession } from "./chat-session.entity";

@Entity("chat_messages")
export class ChatMessage {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column("uuid")
    sessionId: string;

    @ManyToOne(() => ChatSession, (session) => session.messages, { onDelete: "CASCADE" })
    @JoinColumn({ name: "sessionId" })
    session: ChatSession;

    @Column({ type: "varchar", length: 50 })
    role: "user" | "assistant" | "tool";

    @Column({ type: "text" })
    content: string;

    @Column({ type: "varchar", length: 100, nullable: true })
    type?: string;

    @Column({ type: "jsonb", nullable: true })
    data?: Record<string, unknown>;

    @Column({ type: "varchar", length: 255, nullable: true })
    toolCallId?: string;

    @Column({ type: "varchar", length: 255, nullable: true })
    toolName?: string;

    @CreateDateColumn()
    createdAt: Date;
}

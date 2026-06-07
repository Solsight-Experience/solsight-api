import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from "typeorm";

@Entity("rag_documents")
export class RagDocument {
    @PrimaryGeneratedColumn("uuid")
    id: string;

    @Column({ type: "text" })
    content: string;

    @Column({ type: "vector", length: 3072 })
    embedding: number[];

    @Column({ type: "jsonb", default: {} })
    metadata: Record<string, unknown>;

    @CreateDateColumn()
    createdAt: Date;
}

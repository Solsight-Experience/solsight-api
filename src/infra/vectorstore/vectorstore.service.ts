import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { DataSource } from "typeorm";
import { RagDocument } from "../../modules/chat/entities/rag-document.entity";

export interface VectorDocument {
    id?: string;
    content: string;
    embedding: number[];
    metadata: Record<string, unknown>;
    createdAt?: Date;
}

export interface SearchResult {
    content: string;
    metadata: Record<string, unknown>;
    score: number;
}

@Injectable()
export class VectorStoreService implements OnModuleInit {
    private readonly logger = new Logger(VectorStoreService.name);
    private isReadyFlag = false;

    constructor(private readonly dataSource: DataSource) {}

    async onModuleInit(): Promise<void> {
        try {
            // Ensure vector extension exists
            await this.dataSource.query("CREATE EXTENSION IF NOT EXISTS vector;");

            this.isReadyFlag = true;
            this.logger.log("PostgreSQL Vector Store initialized successfully");
        } catch (err) {
            this.logger.error("Failed to initialize PostgreSQL Vector Store", err);
            this.isReadyFlag = false;
        }
    }

    get isReady(): boolean {
        return this.isReadyFlag;
    }

    async upsert(doc: Omit<VectorDocument, "id" | "createdAt">): Promise<void> {
        if (!this.isReady) {
            this.logger.warn("upsert skipped — VectorStore not ready");
            return;
        }
        const embeddingStr = `[${doc.embedding.join(",")}]`;
        await this.dataSource.query(
            `INSERT INTO rag_documents (content, embedding, metadata, "createdAt")
             VALUES ($1, $2::vector, $3, NOW())`,
            [doc.content, embeddingStr, JSON.stringify(doc.metadata)]
        );
    }

    async upsertMany(docs: Omit<VectorDocument, "id" | "createdAt">[]): Promise<void> {
        if (!this.isReady || docs.length === 0) return;

        // Execute batch insertion in parallel
        await Promise.all(docs.map((doc) => this.upsert(doc)));
        this.logger.log(`Ingested ${docs.length} documents into PostgreSQL vector store`);
    }

    async search(embedding: number[], topK = 5, filter?: Record<string, unknown>): Promise<SearchResult[]> {
        if (!this.isReady) {
            this.logger.warn("search skipped — VectorStore not ready");
            return [];
        }

        const embeddingStr = `[${embedding.join(",")}]`;

        let query = `
            SELECT content, metadata, 1 - (embedding <=> $1::vector) AS score
            FROM rag_documents
        `;
        const params: any[] = [embeddingStr];
        let paramIndex = 2;

        if (filter && Object.keys(filter).length > 0) {
            query += ` WHERE metadata @> $${paramIndex}::jsonb`;
            params.push(JSON.stringify(filter));
            paramIndex++;
        }

        query += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
        params.push(topK);

        const results = await this.dataSource.query(query, params);

        return results.map((row: any) => ({
            content: row.content,
            metadata: row.metadata,
            score: Number(row.score)
        }));
    }

    async deleteByFilter(filter: Record<string, unknown>): Promise<number> {
        if (!this.isReady) return 0;

        const result = await this.dataSource
            .getRepository(RagDocument)
            .createQueryBuilder()
            .delete()
            .where("metadata @> :filter", { filter: JSON.stringify(filter) })
            .execute();

        return result.affected ?? 0;
    }
}

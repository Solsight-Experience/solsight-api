import { Injectable, Logger } from "@nestjs/common";
import { OpenAIService } from "src/infra/openai/openai.service";
import { VectorStoreService, SearchResult } from "src/infra/vectorstore/vectorstore.service";

export interface RagDocument {
    content: string;
    metadata?: Record<string, unknown>;
}

export interface RagContext {
    context: string;
    sources: SearchResult[];
}

@Injectable()
export class RagService {
    private readonly logger = new Logger(RagService.name);

    constructor(
        private readonly openaiService: OpenAIService,
        private readonly vectorStore: VectorStoreService
    ) {}

    async ingest(doc: RagDocument): Promise<void> {
        if (!this.vectorStore.isReady) {
            this.logger.warn("ingest skipped — VectorStore not ready");
            return;
        }
        const embedding = await this.openaiService.createEmbedding(doc.content);
        await this.vectorStore.upsert({
            content: doc.content,
            embedding,
            metadata: doc.metadata ?? {}
        });
        this.logger.debug(`Ingested document: ${doc.content.slice(0, 60)}…`);
    }

    async ingestMany(docs: RagDocument[]): Promise<void> {
        if (!this.vectorStore.isReady || docs.length === 0) return;

        const withEmbeddings = await Promise.all(
            docs.map(async (doc) => ({
                content: doc.content,
                embedding: await this.openaiService.createEmbedding(doc.content),
                metadata: doc.metadata ?? {}
            }))
        );

        await this.vectorStore.upsertMany(withEmbeddings);
        this.logger.log(`Ingested ${docs.length} documents into vector store`);
    }

    async retrieve(query: string, topK = 4): Promise<RagContext> {
        if (!this.vectorStore.isReady) {
            return { context: "", sources: [] };
        }

        const queryEmbedding = await this.openaiService.createEmbedding(query);
        const sources = await this.vectorStore.search(queryEmbedding, topK);

        if (sources.length === 0) {
            return { context: "", sources: [] };
        }

        const context = sources.map((s, i) => `[${i + 1}] ${s.content}`).join("\n\n");

        this.logger.debug(`Retrieved ${sources.length} passages for query="${query.slice(0, 60)}"`);

        return { context, sources };
    }

    async buildContextPrompt(query: string, topK = 4): Promise<string> {
        const { context } = await this.retrieve(query, topK);
        if (!context) return "";
        return (
            "RELEVANT KNOWLEDGE BASE:\n" +
            context +
            "\n\nUse the above information to answer the user's question if relevant. " +
            "Do not mention that you have a knowledge base."
        );
    }

    async deleteByMetadata(filter: Record<string, unknown>): Promise<number> {
        return this.vectorStore.deleteByFilter(filter);
    }
}

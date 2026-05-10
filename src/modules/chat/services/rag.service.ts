import { Injectable, Logger } from "@nestjs/common";
import { OpenAIService } from "src/infra/openai/openai.service";
import { VectorStoreService, SearchResult } from "src/infra/vectorstore/vectorstore.service";

export interface RagDocument {
    content: string;
    metadata?: Record<string, unknown>;
}

export interface RagContext {
    /** Retrieved passages joined as a single context string. */
    context: string;
    /** Raw search results with scores (for debugging / logging). */
    sources: SearchResult[];
}

/**
 * RagService — Retrieval-Augmented Generation helpers.
 *
 * Workflow:
 *   1. Ingest: embed documents → store in Atlas Vector Search.
 *   2. Retrieve: embed a query → vector search → return top-k passages.
 *   3. Augment: caller appends the retrieved context to the LLM prompt.
 *
 * Usage in ChatService:
 *   const { context } = await this.ragService.retrieve(userMessage);
 *   // prepend context to the system prompt before calling the LLM
 */
@Injectable()
export class RagService {
    private readonly logger = new Logger(RagService.name);

    constructor(
        private readonly openaiService: OpenAIService,
        private readonly vectorStore: VectorStoreService
    ) {}

    /** Embed and store a single document. */
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

    /** Embed and store many documents in one batch. */
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

    /**
     * Retrieve the top-k most relevant passages for a query.
     * Returns a formatted context string ready to inject into the LLM prompt.
     */
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

    /**
     * Build a system prompt snippet from retrieved context.
     * Returns an empty string if nothing relevant was found.
     */
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

    /** Remove all documents matching a metadata filter. */
    async deleteByMetadata(filter: Record<string, unknown>): Promise<number> {
        return this.vectorStore.deleteByFilter(filter);
    }
}

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongoClient, Collection, Document } from "mongodb";

export interface VectorDocument {
    _id?: string;
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

/*
Atlas Search index must be created manually in the Atlas UI:
- Collection: <MONGODB_VECTOR_COLLECTION>  (default: "rag_documents")
- Index name: <MONGODB_VECTOR_INDEX>        (default: "vector_index")
- Index definition (JSON):
    {
        "fields": [{
            "type": "vector",
            "path": "embedding",
            "numDimensions": 1536,
            "similarity": "cosine"
        }]
    }
 */
@Injectable()
export class VectorStoreService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(VectorStoreService.name);
    private client: MongoClient | null = null;
    private collection: Collection<VectorDocument> | null = null;

    private readonly uri: string;
    private readonly dbName: string;
    private readonly collectionName: string;
    private readonly indexName: string;

    constructor(private readonly configService: ConfigService) {
        this.uri = this.configService.get<string>("mongodb.uri") ?? "";
        this.dbName = this.configService.get<string>("mongodb.db") ?? "solsight_rag";
        this.collectionName = this.configService.get<string>("mongodb.vectorCollection") ?? "rag_documents";
        this.indexName = this.configService.get<string>("mongodb.vectorIndex") ?? "vector_index";
    }

    async onModuleInit(): Promise<void> {
        if (!this.uri) {
            this.logger.warn("MONGODB_URI not set — VectorStoreService disabled");
            return;
        }
        try {
            this.client = new MongoClient(this.uri);
            await this.client.connect();
            this.collection = this.client.db(this.dbName).collection<VectorDocument>(this.collectionName);
            this.logger.log(`Connected to MongoDB Atlas — db=${this.dbName} collection=${this.collectionName}`);
        } catch (err) {
            this.logger.error("Failed to connect to MongoDB Atlas", err);
            this.client = null;
            this.collection = null;
        }
    }

    async onModuleDestroy(): Promise<void> {
        await this.client?.close();
    }

    get isReady(): boolean {
        return this.collection !== null;
    }

    async upsert(doc: Omit<VectorDocument, "_id" | "createdAt">): Promise<void> {
        if (!this.collection) {
            this.logger.warn("upsert skipped — VectorStore not ready");
            return;
        }
        await this.collection.insertOne({ ...doc, createdAt: new Date() } as VectorDocument);
    }

    async upsertMany(docs: Omit<VectorDocument, "_id" | "createdAt">[]): Promise<void> {
        if (!this.collection || docs.length === 0) return;
        const now = new Date();
        await this.collection.insertMany(docs.map((d) => ({ ...d, createdAt: now }) as VectorDocument));
    }

    async search(embedding: number[], topK = 5, filter?: Document): Promise<SearchResult[]> {
        if (!this.collection) {
            this.logger.warn("search skipped — VectorStore not ready");
            return [];
        }

        const pipeline: Document[] = [
            {
                $vectorSearch: {
                    index: this.indexName,
                    path: "embedding",
                    queryVector: embedding,
                    numCandidates: topK * 10,
                    limit: topK,
                    ...(filter ? { filter } : {})
                }
            },
            {
                $project: {
                    content: 1,
                    metadata: 1,
                    score: { $meta: "vectorSearchScore" }
                }
            }
        ];

        const cursor = this.collection.aggregate<{
            content: string;
            metadata: Record<string, unknown>;
            score: number;
        }>(pipeline);

        const results: SearchResult[] = [];
        for await (const doc of cursor) {
            results.push({ content: doc.content, metadata: doc.metadata, score: doc.score });
        }
        return results;
    }

    async deleteByFilter(filter: Document): Promise<number> {
        if (!this.collection) return 0;
        const result = await this.collection.deleteMany(filter as Parameters<typeof this.collection.deleteMany>[0]);
        return result.deletedCount;
    }
}

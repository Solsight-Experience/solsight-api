/**
 * RAG Ingest Script: embed JSON documents and store in MongoDB Atlas Vector Search.
 *
 * Usage:
 *   pnpm rag:ingest                              — ingest docs/knowledge-base.json
 *   pnpm rag:ingest -- --file ./docs/extra.json  — merge thêm file tùy chỉnh
 *   pnpm rag:ingest:clear                        — xóa hết rồi ingest lại
 *
 * JSON format (array of objects):
 *   [
 *     { "content": "...", "metadata": { "topic": "staking", "lang": "vi" } },
 *     { "content": "..." }
 *   ]
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { MongoClient } from "mongodb";
import OpenAI from "openai";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB = process.env.MONGODB_DB ?? "solsight_rag";
const MONGODB_VECTOR_COLLECTION = process.env.MONGODB_VECTOR_COLLECTION ?? "rag_documents";

const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY ?? "";
const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL ?? "";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? "";
const EMBED_BATCH_SIZE = 20;
const DEFAULT_KB_FILE = resolve(__dirname, "../../docs/knowledge-base.json");

interface RawDoc {
    content: string;
    metadata?: Record<string, unknown>;
}

function chunks<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
    const client = new OpenAI({
        apiKey: EMBEDDING_API_KEY,
        baseURL: EMBEDDING_API_URL || undefined
    });

    const result = await client.embeddings.create({
        model: EMBEDDING_MODEL,
        input: texts.map((t) => t.replace(/\n/g, " "))
    });

    return result.data.map((d) => d.embedding);
}

function loadJsonFile(filePath: string): RawDoc[] {
    const abs = resolve(filePath);
    const raw = readFileSync(abs, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`${filePath}: must be a JSON array`);
    return parsed as RawDoc[];
}

async function main() {
    if (!MONGODB_URI) {
        console.error("MONGODB_URI is not set in .env");
        process.exit(1);
    }
    if (!EMBEDDING_API_KEY) {
        console.error("EMBEDDING_API_KEY is not set in .env");
        process.exit(1);
    }
    if (!EMBEDDING_MODEL) {
        console.error("EMBEDDING_MODEL is not set in .env");
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const fileIdx = args.indexOf("--file");
    const shouldClear = args.includes("--clear");
    const extraFile = fileIdx >= 0 ? args[fileIdx + 1] : null;

    const docs: RawDoc[] = loadJsonFile(DEFAULT_KB_FILE);
    console.log(`Loaded ${docs.length} docs from knowledge-base.json`);

    if (extraFile) {
        const extra = loadJsonFile(extraFile);
        console.log(`Merged ${extra.length} extra docs from ${extraFile}`);
        docs.push(...extra);
    }

    console.log(`Total documents to ingest: ${docs.length}`);

    console.log(`Embedding model: ${EMBEDDING_MODEL}${EMBEDDING_API_URL ? ` (URL: ${EMBEDDING_API_URL})` : ""}`);

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log("Successfully connected to MongoDB Atlas");

    try {
        const col = client.db(MONGODB_DB).collection(MONGODB_VECTOR_COLLECTION);

        if (shouldClear) {
            const { deletedCount } = await col.deleteMany({});
            console.log(`Deleted ${deletedCount} old documents`);
        }

        let inserted = 0;
        for (const batch of chunks(docs, EMBED_BATCH_SIZE)) {
            const embeddings = await embedBatch(batch.map((d) => d.content));
            await col.insertMany(
                batch.map((doc, i) => ({
                    content: doc.content,
                    embedding: embeddings[i],
                    metadata: doc.metadata ?? {},
                    createdAt: new Date()
                }))
            );
            inserted += batch.length;
            console.log(`  Progress: ${inserted}/${docs.length}`);
        }

        console.log(`\nDone! ${inserted} documents -> ${MONGODB_DB}/${MONGODB_VECTOR_COLLECTION}`);
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error("Ingest failed:", err);
    process.exit(1);
});

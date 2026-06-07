/**
 * RAG Ingest Script: embed JSON documents and store in PostgreSQL (pgvector).
 *
 * Usage:
 *   pnpm rag:ingest                              — ingest docs/knowledge-base.json
 *   pnpm rag:ingest -- --file ./docs/extra.json  — merge additional custom file
 *   pnpm rag:ingest:clear                        — clear all and ingest again
 *
 * JSON format (array of objects):
 *   [
 *     { "content": "...", "metadata": { "topic": "staking", "lang": "vi" } },
 *     { "content": "..." }
 *   ]
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import { Client } from "pg";
import OpenAI from "openai";

const DATABASE_URL = process.env.DATABASE_URL ?? "";

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
    if (!DATABASE_URL) {
        console.error("DATABASE_URL is not set in environment");
        process.exit(1);
    }
    if (!EMBEDDING_API_KEY) {
        console.error("EMBEDDING_API_KEY is not set in environment");
        process.exit(1);
    }
    if (!EMBEDDING_MODEL) {
        console.error("EMBEDDING_MODEL is not set in environment");
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

    const client = new Client({
        connectionString: DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    await client.connect();
    console.log("Successfully connected to PostgreSQL");

    try {
        // Ensure extension and table exist
        await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
        await client.query(`
            CREATE TABLE IF NOT EXISTS rag_documents (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                content TEXT NOT NULL,
                embedding VECTOR(3072) NOT NULL,
                metadata JSONB DEFAULT '{}',
                "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
            );
        `);

        if (shouldClear) {
            const { rowCount } = await client.query("DELETE FROM rag_documents;");
            console.log(`Deleted ${rowCount ?? 0} old documents`);
        }

        let inserted = 0;
        for (const batch of chunks(docs, EMBED_BATCH_SIZE)) {
            const embeddings = await embedBatch(batch.map((d) => d.content));

            for (let i = 0; i < batch.length; i++) {
                const doc = batch[i];
                const embeddingStr = `[${embeddings[i].join(",")}]`;
                await client.query(
                    `INSERT INTO rag_documents (content, embedding, metadata, "createdAt")
                     VALUES ($1, $2::vector, $3, NOW())`,
                    [doc.content, embeddingStr, JSON.stringify(doc.metadata ?? {})]
                );
            }

            inserted += batch.length;
            console.log(`  Progress: ${inserted}/${docs.length}`);
        }

        console.log(`\nDone! ${inserted} documents -> PostgreSQL (rag_documents table)`);
    } finally {
        await client.end();
    }
}

main().catch((err) => {
    console.error("Ingest failed:", err);
    process.exit(1);
});

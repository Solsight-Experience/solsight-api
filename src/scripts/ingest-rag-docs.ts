/**
 * RAG Ingest Script — embed JSON documents and store in MongoDB Atlas Vector Search.
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
import { GoogleGenerativeAI } from "@google/generative-ai";

// .env is loaded via --env-file=.env flag in the npm script (Node 20+)

// ─── Config ───────────────────────────────────────────────────────────────────

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const MONGODB_DB = process.env.MONGODB_DB ?? "solsight_rag";
const MONGODB_VECTOR_COLLECTION = process.env.MONGODB_VECTOR_COLLECTION ?? "rag_documents";
// Embedding provider: "gemini" (default, free) or "openai"
// Gemini: text-embedding-004, 768 dims — dùng GEMINI_API_KEY (native REST, không qua OpenAI SDK)
// OpenAI: text-embedding-3-small, 1536 dims — dùng OPENAI_DIRECT_API_KEY hoặc OPENAI_API_KEY
const EMBEDDING_PROVIDER = (process.env.EMBEDDING_PROVIDER ?? "gemini") as "gemini" | "openai";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_DIRECT_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
const EMBEDDING_MODEL = EMBEDDING_PROVIDER === "gemini" ? "gemini-embedding-001" : "text-embedding-3-small";
const EMBED_BATCH_SIZE = 20;

// Default knowledge base file — edit docs/knowledge-base.json để thêm/sửa tài liệu
const DEFAULT_KB_FILE = resolve(__dirname, "../../docs/knowledge-base.json");

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawDoc {
    content: string;
    metadata?: Record<string, unknown>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function chunks<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
    if (EMBEDDING_PROVIDER === "gemini") {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: EMBEDDING_MODEL });
        const results = await Promise.all(texts.map((t) => model.embedContent(t.replace(/\n/g, " "))));
        return results.map((r) => r.embedding.values);
    }

    // OpenAI direct
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey: OPENAI_API_KEY });
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
    if (!Array.isArray(parsed)) throw new Error(`${filePath}: phải là JSON array`);
    return parsed as RawDoc[];
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    if (!MONGODB_URI) {
        console.error("❌  MONGODB_URI chưa được set trong .env");
        process.exit(1);
    }
    if (EMBEDDING_PROVIDER === "gemini" && !GEMINI_API_KEY) {
        console.error("❌  GEMINI_API_KEY chưa được set trong .env");
        process.exit(1);
    }
    if (EMBEDDING_PROVIDER === "openai" && !OPENAI_API_KEY) {
        console.error("❌  OPENAI_API_KEY (hoặc OPENAI_DIRECT_API_KEY) chưa được set trong .env");
        process.exit(1);
    }

    const args = process.argv.slice(2);
    const fileIdx = args.indexOf("--file");
    const shouldClear = args.includes("--clear");
    const extraFile = fileIdx >= 0 ? args[fileIdx + 1] : null;

    // Load knowledge base chính
    const docs: RawDoc[] = loadJsonFile(DEFAULT_KB_FILE);
    console.log(`📚  Loaded ${docs.length} docs từ knowledge-base.json`);

    // Merge thêm file tùy chỉnh nếu có
    if (extraFile) {
        const extra = loadJsonFile(extraFile);
        console.log(`📄  Merge thêm ${extra.length} docs từ ${extraFile}`);
        docs.push(...extra);
    }

    console.log(`📦  Tổng số documents sẽ ingest: ${docs.length}`);

    console.log(`🔧  Embedding provider: ${EMBEDDING_PROVIDER} (model: ${EMBEDDING_MODEL})`);

    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    console.log("✅  Kết nối MongoDB Atlas thành công");

    try {
        const col = client.db(MONGODB_DB).collection(MONGODB_VECTOR_COLLECTION);

        if (shouldClear) {
            const { deletedCount } = await col.deleteMany({});
            console.log(`🗑️   Đã xóa ${deletedCount} documents cũ`);
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
            console.log(`  ↑ ${inserted}/${docs.length}`);
        }

        console.log(`\n✅  Xong! ${inserted} documents → ${MONGODB_DB}/${MONGODB_VECTOR_COLLECTION}`);
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error("❌  Ingest thất bại:", err);
    process.exit(1);
});

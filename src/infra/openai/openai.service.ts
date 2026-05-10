import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { APIPromise, RequestOptions } from "openai/core";
import {
    ChatCompletion,
    ChatCompletionChunk,
    ChatCompletionCreateParams,
    ChatCompletionCreateParamsNonStreaming,
    ChatCompletionCreateParamsStreaming
} from "openai/resources/chat";
import { ChatCompletionCreateParamsBase } from "openai/resources/chat/completions";
import { Stream } from "openai/streaming";

@Injectable()
export class OpenAIService {
    private readonly logger = new Logger(OpenAIService.name);
    private readonly client: OpenAI;
    private readonly model: string;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>("openai.apiKey");
        const baseURL = this.configService.get<string>("openai.apiUrl");
        const model = this.configService.get<string>("openai.model");

        if (!apiKey) {
            this.logger.warn("OpenAI API key or model not configured for default client");
        }

        if (!model) {
            throw new Error("OpenAI model is not configured!");
        }

        this.model = model;

        this.client = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL
        });

        this.logger.log(`Initialized OpenAI client: baseURL=${baseURL}, model=${this.model}`);
    }

    createCompletion(body: Omit<ChatCompletionCreateParamsNonStreaming, "model">, options?: RequestOptions<unknown>): APIPromise<ChatCompletion>;

    createCompletion(body: Omit<ChatCompletionCreateParamsStreaming, "model">, options?: RequestOptions<unknown>): APIPromise<Stream<ChatCompletionChunk>>;

    createCompletion(
        body: Omit<ChatCompletionCreateParamsBase, "model">,
        options?: RequestOptions<unknown>
    ): APIPromise<ChatCompletion> | APIPromise<Stream<ChatCompletionChunk>>;

    // single implementation
    createCompletion(
        body: Omit<ChatCompletionCreateParams, "model">,
        options?: RequestOptions<unknown>
    ): APIPromise<ChatCompletion | Stream<ChatCompletionChunk>> {
        return this.client.chat.completions.create(
            {
                model: this.model,
                ...body
            },
            options
        );
    }

    /**
     * Generate a text embedding vector.
     * Provider is controlled by EMBEDDING_PROVIDER env var:
     *   "gemini"  → Google text-embedding-004 (768 dims) via native REST API
     *   "openai"  → OpenAI text-embedding-3-small (1536 dims)
     */
    async createEmbedding(text: string): Promise<number[]> {
        const provider = this.configService.get<string>("embedding.provider") ?? "gemini";
        const input = text.replace(/\n/g, " ");

        if (provider === "gemini") {
            const apiKey = this.configService.get<string>("embedding.geminiApiKey") ?? "";
            if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
            const genAI = new GoogleGenerativeAI(apiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-embedding-001" });
            const result = await model.embedContent(input);
            return result.embedding.values;
        }

        // default: openai direct
        const apiKey = this.configService.get<string>("embedding.openaiDirectApiKey") ?? "";
        if (!apiKey) throw new Error("OPENAI_API_KEY is not set for embeddings");
        const openai = new OpenAI({ apiKey });
        const result = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input
        });
        return result.data[0].embedding;
    }
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
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
    private readonly client: OpenAI | null = null;
    private readonly model: string;

    constructor(private readonly configService: ConfigService) {
        const apiKey = this.configService.get<string>("openai.apiKey");
        const baseURL = this.configService.get<string>("openai.apiUrl");
        const model = this.configService.get<string>("openai.model") ?? "gpt-4o";

        this.model = model;

        if (!apiKey) {
            this.logger.warn("OPENAI_API_KEY not set — OpenAI features will be unavailable");
            return;
        }

        this.client = new OpenAI({ apiKey, baseURL });
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
        if (!this.client) {
            throw new Error("OpenAI client is not configured — set OPENAI_API_KEY to use this feature");
        }
        return this.client.chat.completions.create(
            {
                model: this.model,
                ...body
            },
            options
        );
    }
}

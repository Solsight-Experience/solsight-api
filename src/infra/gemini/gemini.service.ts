import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { OpenAIService } from "../openai/openai.service";
import { GeminiGenerateRequest, GeminiGenerateResponse, GeminiError, GeminiApiError } from "./types/gemini.types";

@Injectable()
export class GeminiService {
    private readonly logger = new Logger(GeminiService.name);

    constructor(
        private readonly configService: ConfigService,
        private readonly openaiService: OpenAIService
    ) {
        // this.modelName = this.configService.get<string>("openai.model") || "gemini-2.0-flash-exp";
    }

    /**
     * Generate text using OpenAI-compatible API (Google Gemini endpoint)
     * @param request - Generation request parameters
     * @returns Generated text response
     */
    async generateText(request: GeminiGenerateRequest): Promise<GeminiGenerateResponse> {
        try {
            const startTime = Date.now();

            const completion = await this.openaiService.createCompletion({
                messages: [
                    {
                        role: "user",
                        content: request.prompt
                    }
                ],
                temperature: request.temperature ?? 0.5,
                max_tokens: request.maxOutputTokens ?? 800,
                top_p: request.topP ?? 0.95
            });

            const text = completion.choices[0]?.message?.content || "";
            const duration = Date.now() - startTime;

            this.logger.log(`Text generated successfully in ${duration}ms`);

            return {
                text,
                model: completion.model,
                finishReason: completion.choices[0]?.finish_reason,
                promptTokenCount: completion.usage?.prompt_tokens,
                candidatesTokenCount: completion.usage?.completion_tokens,
                totalTokenCount: completion.usage?.total_tokens
            };
        } catch (error) {
            this.logger.error("Error generating text with OpenAI", error);

            const apiError = error instanceof Error ? (error as GeminiApiError) : undefined;
            const geminiError: GeminiError = {
                message: apiError?.message ?? "Failed to generate text",
                code: apiError?.code != null ? String(apiError.code) : undefined,
                status: apiError?.status
            };

            throw new Error(geminiError.message);
        }
    }

    /**
     * Generate streaming text (for future implementation)
     * @param request - Generation request parameters
     */
    async generateStreaming(request: GeminiGenerateRequest): Promise<AsyncGenerator<string>> {
        try {
            const stream = await this.openaiService.createCompletion({
                messages: [
                    {
                        role: "user",
                        content: request.prompt
                    }
                ],
                temperature: request.temperature ?? 0.5,
                max_tokens: request.maxOutputTokens ?? 800,
                top_p: request.topP ?? 0.95,
                stream: true
            });

            async function* streamGenerator() {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content || "";
                    if (content) {
                        yield content;
                    }
                }
            }

            return streamGenerator();
        } catch (error) {
            this.logger.error("Error generating streaming text with OpenAI", error);
            throw error;
        }
    }

    /**
     * Check if OpenAI service is configured properly
     */
    isConfigured(): boolean {
        return !!this.configService.get<string>("openai.apiKey");
    }
}

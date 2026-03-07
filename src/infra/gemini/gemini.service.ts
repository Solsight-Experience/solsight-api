import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import {
  GeminiGenerateRequest,
  GeminiGenerateResponse,
  GeminiError,
} from './types/gemini.types';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly genAI: GoogleGenerativeAI;
  private readonly model: GenerativeModel;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('gemini.apiKey') || '';
    this.modelName =
      this.configService.get<string>('gemini.model') || 'gemini-2.0-flash-exp';

    if (!apiKey) {
      this.logger.warn('Gemini API key not configured');
    }

    this.genAI = new GoogleGenerativeAI(apiKey);
    this.model = this.genAI.getGenerativeModel({ model: this.modelName });
  }

  /**
   * Generate text using Gemini AI
   * @param request - Generation request parameters
   * @returns Generated text response
   */
  async generateText(
    request: GeminiGenerateRequest,
  ): Promise<GeminiGenerateResponse> {
    try {
      this.logger.log(`Generating text with model: ${this.modelName}`);
      const startTime = Date.now();

      const generationConfig = {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxOutputTokens ?? 2048,
        topP: request.topP ?? 0.95,
        topK: request.topK ?? 40,
      };

      const result = await this.model.generateContent({
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig,
      });

      const response = result.response;
      const text = response.text();
      const duration = Date.now() - startTime;

      this.logger.log(`Text generated successfully in ${duration}ms`);

      // Extract token usage if available
      const usageMetadata = response.usageMetadata;

      return {
        text,
        model: this.modelName,
        finishReason: response.candidates?.[0]?.finishReason,
        promptTokenCount: usageMetadata?.promptTokenCount,
        candidatesTokenCount: usageMetadata?.candidatesTokenCount,
        totalTokenCount: usageMetadata?.totalTokenCount,
      };
    } catch (error) {
      this.logger.error('Error generating text with Gemini', error);

      const geminiError: GeminiError = {
        message:
          error instanceof Error ? error.message : 'Failed to generate text',
        code: (error as any)?.code,
        status: (error as any)?.status,
      };

      throw geminiError;
    }
  }

  /**
   * Generate streaming text (for future implementation)
   * @param request - Generation request parameters
   */
  async generateStreaming(
    request: GeminiGenerateRequest,
  ): Promise<AsyncGenerator<string>> {
    try {
      this.logger.log(
        `Generating streaming text with model: ${this.modelName}`,
      );

      const generationConfig = {
        temperature: request.temperature ?? 0.7,
        maxOutputTokens: request.maxOutputTokens ?? 2048,
        topP: request.topP ?? 0.95,
        topK: request.topK ?? 40,
      };

      const result = await this.model.generateContentStream({
        contents: [{ role: 'user', parts: [{ text: request.prompt }] }],
        generationConfig,
      });

      async function* streamGenerator() {
        for await (const chunk of result.stream) {
          const chunkText = chunk.text();
          yield chunkText;
        }
      }

      return streamGenerator();
    } catch (error) {
      this.logger.error('Error generating streaming text with Gemini', error);
      throw error;
    }
  }

  /**
   * Check if Gemini service is configured properly
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>('gemini.apiKey');
  }
}

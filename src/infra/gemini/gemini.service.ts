import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  GeminiGenerateRequest,
  GeminiGenerateResponse,
  GeminiError,
} from './types/gemini.types';

@Injectable()
export class GeminiService {
  private readonly logger = new Logger(GeminiService.name);
  private readonly openai: OpenAI;
  private readonly modelName: string;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('openai.apiKey') || '';
    const baseURL = this.configService.get<string>('openai.baseURL');
    this.modelName =
      this.configService.get<string>('openai.model') || 'gemini-2.0-flash-exp';

    if (!apiKey) {
      this.logger.warn('OpenAI API key not configured');
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  /**
   * Generate text using OpenAI-compatible API (Google Gemini endpoint)
   * @param request - Generation request parameters
   * @returns Generated text response
   */
  async generateText(
    request: GeminiGenerateRequest,
  ): Promise<GeminiGenerateResponse> {
    try {
      this.logger.log(`Generating text with model: ${this.modelName}`);
      const startTime = Date.now();

      const completion = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: request.prompt,
          },
        ],
        temperature: request.temperature ?? 0.5,
        max_tokens: request.maxOutputTokens ?? 800,
        top_p: request.topP ?? 0.95,
      });

      const text = completion.choices[0]?.message?.content || '';
      const duration = Date.now() - startTime;

      this.logger.log(`Text generated successfully in ${duration}ms`);

      return {
        text,
        model: completion.model,
        finishReason: completion.choices[0]?.finish_reason,
        promptTokenCount: completion.usage?.prompt_tokens,
        candidatesTokenCount: completion.usage?.completion_tokens,
        totalTokenCount: completion.usage?.total_tokens,
      };
    } catch (error) {
      this.logger.error('Error generating text with OpenAI', error);

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

      const stream = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: [
          {
            role: 'user',
            content: request.prompt,
          },
        ],
        temperature: request.temperature ?? 0.5,
        max_tokens: request.maxOutputTokens ?? 800,
        top_p: request.topP ?? 0.95,
        stream: true,
      });

      async function* streamGenerator() {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            yield content;
          }
        }
      }

      return streamGenerator();
    } catch (error) {
      this.logger.error('Error generating streaming text with OpenAI', error);
      throw error;
    }
  }

  /**
   * Check if OpenAI service is configured properly
   */
  isConfigured(): boolean {
    return !!this.configService.get<string>('openai.apiKey');
  }
}

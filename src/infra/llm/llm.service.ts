import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { Stream } from 'openai/streaming';
import type { ChatCompletion, ChatCompletionChunk } from 'openai/resources/chat/completions';
import {
  LLMChatRequest,
  LLMChatResponse,
  LLMChatStreamRequest,
  LLMGenerateRequest,
  LLMGenerateResponse,
} from './types/llm.types';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('llm.apiKey') || '';
    const apiUrl = this.configService.get<string>('llm.apiUrl');
    this.model = this.configService.get<string>('llm.model') || 'gpt-4o';
    this.timeoutMs = this.configService.get<number>('llm.timeoutMs') || 30000;

    if (!apiKey) {
      this.logger.warn('LLM API key not configured');
    }

    this.client = new OpenAI({ apiKey, baseURL: apiUrl });

    this.logger.log(`LLMService initialized: model=${this.model}`);
  }

  isConfigured(): boolean {
    return !!this.configService.get<string>('llm.apiKey');
  }

  // ---------------------------------------------------------------------------
  // Simple text generation (used by token summaries, etc.)
  // ---------------------------------------------------------------------------

  async generateText(request: LLMGenerateRequest): Promise<LLMGenerateResponse> {
    this.logger.log(`generateText: model=${this.model}`);
    const startTime = Date.now();

    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: request.prompt }],
      temperature: request.temperature ?? 0.5,
      max_tokens: request.maxTokens ?? 800,
      top_p: request.topP ?? 0.95,
    });

    const text = completion.choices[0]?.message?.content || '';
    this.logger.log(`generateText completed in ${Date.now() - startTime}ms`);

    return {
      text,
      model: completion.model,
      finishReason: completion.choices[0]?.finish_reason,
      usage: {
        promptTokens: completion.usage?.prompt_tokens,
        completionTokens: completion.usage?.completion_tokens,
        totalTokens: completion.usage?.total_tokens,
      },
    };
  }

  async *generateTextStream(request: LLMGenerateRequest): AsyncGenerator<string> {
    this.logger.log(`generateTextStream: model=${this.model}`);

    const stream = await this.client.chat.completions.create({
      model: this.model,
      messages: [{ role: 'user', content: request.prompt }],
      temperature: request.temperature ?? 0.5,
      max_tokens: request.maxTokens ?? 800,
      top_p: request.topP ?? 0.95,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) yield content;
    }
  }

  // ---------------------------------------------------------------------------
  // Chat completions with tool calling (used by the chat agent)
  // ---------------------------------------------------------------------------

  async chatCompletion(request: LLMChatRequest): Promise<LLMChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const completion: ChatCompletion = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: request.messages,
          tools: request.tools,
          tool_choice: request.toolChoice ?? 'auto',
          parallel_tool_calls: request.parallelToolCalls ?? false,
          stream: false,
        },
        { signal: controller.signal },
      );

      const choice = completion.choices[0];
      return {
        content: choice?.message?.content ?? null,
        finishReason: choice?.finish_reason ?? null,
        toolCalls: choice?.message?.tool_calls
          ?.filter((tc) => tc.type === 'function')
          .map((tc) => ({
            id: tc.id,
            name: tc.function.name,
            arguments: tc.function.arguments,
          })),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async chatCompletionStream(
    request: LLMChatStreamRequest,
  ): Promise<Stream<ChatCompletionChunk>> {
    return this.client.chat.completions.create({
      model: this.model,
      messages: request.messages,
      tools: request.tools,
      tool_choice: request.toolChoice ?? 'auto',
      parallel_tool_calls: request.parallelToolCalls ?? false,
      stream: true,
    });
  }
}

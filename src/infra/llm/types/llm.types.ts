import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions';

export interface LLMGenerateRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface LLMGenerateResponse {
  text: string;
  model: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface LLMChatRequest {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  toolChoice?: 'auto' | 'none';
  parallelToolCalls?: boolean;
  stream?: false;
}

export interface LLMChatStreamRequest {
  messages: ChatCompletionMessageParam[];
  tools?: ChatCompletionTool[];
  toolChoice?: 'auto' | 'none';
  parallelToolCalls?: boolean;
  stream: true;
}

export type LLMChatResponse = {
  content: string | null;
  finishReason: string | null;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: string;
  }>;
};

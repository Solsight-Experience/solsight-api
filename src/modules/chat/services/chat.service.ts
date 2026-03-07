import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions';
import { AppLoggerService } from '../../../common/logger/logger.service';
import {
  SortByTrending,
  TimeFrame,
} from '../../discovery/dtos/get-trending.dto';
import { DiscoveryService } from '../../discovery/services/discovery.service';
import { PortfolioService } from '../../portfolio/services/portfolio.service';
import { TokensService } from '../../tokens/services/tokens.service';
import {
  ChatResponsePayload,
  ChatSession,
  SendMessagePayload,
} from '../types/chat.types';

const SYSTEM_PROMPT =
  'You are Solsight AI, a DeFi assistant for the Solana ecosystem. Help users with token information, portfolio overview, and trade preparation. Always use tools to get real data before answering.';

const STATIC_ROUTES = [
  '/',
  '/portfolio',
  '/dashboard',
  '/dashboard/transfer',
  '/profile',
  '/authentication',
];

const TOKEN_ROUTE_REGEX = /^\/token\/[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const LLM_TIMEOUT_MS = 30000;

const RESPONSE_TYPES: ChatResponsePayload['type'][] = [
  'text',
  'token_brief',
  'portfolio_summary',
  'navigation',
  'trade_intent',
];

export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'fetch_token_data',
      description: 'Fetch detailed token information by token mint address',
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'Solana token mint address',
          },
        },
        required: ['address'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_tokens',
      description: 'Search tokens by symbol, name, or address',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query for token lookup',
          },
          limit: {
            type: 'number',
            description: 'Max number of tokens to return',
          },
        },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_discovery',
      description: 'Fetch discovery list (trending/new tokens) with optional filters',
      parameters: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            description: 'Discovery category name',
          },
          sortBy: {
            type: 'string',
            description: 'Sort field for discovery results',
          },
        },
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'fetch_portfolio',
      description: 'Fetch user portfolio overview and top allocations',
      parameters: {
        type: 'object',
        properties: {
          userId: {
            type: 'string',
            description: 'Application user id',
          },
          walletAddresses: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional wallet addresses filter',
          },
        },
        required: ['userId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'prepare_swap',
      description: 'Prepare swap intent object from user input without execution',
      parameters: {
        type: 'object',
        properties: {
          inputMint: {
            type: 'string',
            description: 'Input token mint address',
          },
          outputMint: {
            type: 'string',
            description: 'Output token mint address',
          },
          amount: {
            type: 'number',
            description: 'Token amount to swap',
          },
        },
        required: ['inputMint', 'outputMint', 'amount'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'navigate_to',
      description: 'Return validated frontend route for navigation action',
      parameters: {
        type: 'object',
        properties: {
          route: {
            type: 'string',
            description: 'Frontend route',
          },
        },
        required: ['route'],
        additionalProperties: false,
      },
    },
  },
];

@Injectable()
export class ChatService {
  private readonly openai: OpenAI;
  private readonly sessions = new Map<string, ChatSession>();
  private readonly model: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly tokensService: TokensService,
    private readonly discoveryService: DiscoveryService,
    private readonly portfolioService: PortfolioService,
    private readonly logger: AppLoggerService,
  ) {
    const apiKey = this.configService.get<string>('llm.apiKey');
    const baseURL = this.configService.get<string>('llm.apiUrl');

    if (!apiKey) {
      throw new Error('LLM API key is required');
    }

    this.model = this.configService.get<string>('llm.model') || 'gpt-4o';
    this.openai = new OpenAI({
      apiKey,
      baseURL,
    });
  }

  async sendMessage(payload: SendMessagePayload): Promise<ChatResponsePayload> {
    const session = this.getOrCreateSession(payload.sessionId);

    if (session.processing) {
      throw new HttpException('Already processing a message', 429);
    }

    session.messages.push({
      role: 'user',
      content: payload.message,
    });

    session.processing = true;

    try {
      const response = await this.runLlmLoop(session, payload.walletAddress);
      return {
        ...response,
        sessionId: payload.sessionId,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown LLM error';
      this.logger.error(
        `Failed to process chat message: ${message}`,
        error instanceof Error ? error.stack : undefined,
        ChatService.name,
      );

      return {
        sessionId: payload.sessionId,
        type: 'text',
        content:
          'I encountered an issue while processing your request. Please try again in a moment.',
      };
    } finally {
      session.processing = false;
    }
  }

  async runLlmLoop(
    session: ChatSession,
    walletAddress?: string,
  ): Promise<ChatResponsePayload> {
    const recentMessages = session.messages.slice(-10);
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: SYSTEM_PROMPT,
      },
      ...recentMessages.map((message): ChatCompletionMessageParam => {
        if (message.role === 'tool') {
          return {
            role: 'tool' as const,
            content: message.content,
            tool_call_id: message.toolCallId || '',
          };
        }

        return {
          role: message.role,
          content: message.content,
        };
      }),
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);

    try {
      const completion = await this.openai.chat.completions.create(
        {
          model: this.model,
          messages,
          tools: TOOL_DEFINITIONS,
          tool_choice: 'auto',
          parallel_tool_calls: false,
          stream: false,
        },
        {
          signal: controller.signal,
        },
      );

      const choice = completion.choices[0];
      if (!choice) {
        return {
          sessionId: '',
          type: 'text',
          content: 'No response received from LLM.',
        };
      }

      if (choice.finish_reason === 'tool_calls') {
        const assistantMessage = choice.message;
        session.messages.push({
          role: 'assistant',
          content: assistantMessage.content || '',
        });

        const toolCalls = assistantMessage.tool_calls || [];
        for (const toolCall of toolCalls) {
          if (toolCall.type !== 'function') {
            continue;
          }

          const toolName = toolCall.function.name;
          let args: Record<string, unknown> = {};

          try {
            args = JSON.parse(toolCall.function.arguments || '{}') as Record<
              string,
              unknown
            >;
          } catch (error) {
            this.logger.warn(
              `Invalid tool arguments for ${toolName}: ${toolCall.function.arguments}`,
              ChatService.name,
            );
          }

          const result = await this.executeTool(toolName, args, walletAddress);
          session.messages.push({
            role: 'tool',
            content: result,
            toolCallId: toolCall.id,
            toolName,
          });
        }

        return this.runLlmLoop(session, walletAddress);
      }

      const assistantContent = choice.message.content || '';
      session.messages.push({
        role: 'assistant',
        content: assistantContent,
      });

      return this.parseResponse(assistantContent);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown LLM error';
      this.logger.error(
        `OpenAI chat completion failed: ${message}`,
        error instanceof Error ? error.stack : undefined,
        ChatService.name,
      );
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
    walletAddress?: string,
  ): Promise<string> {
    try {
      switch (toolName) {
        case 'fetch_token_data': {
          const address = String(args.address || '');
          const data = await this.tokensService.findOne(address);
          return JSON.stringify(data);
        }

        case 'search_tokens': {
          const query = String(args.query || '');
          const limit =
            typeof args.limit === 'number' && Number.isFinite(args.limit)
              ? args.limit
              : 5;

          try {
            const filterResult = await (
              this.tokensService.filter as unknown as (
                payload: Record<string, unknown>,
              ) => Promise<unknown>
            )({
              search: query,
              limit,
              page: 1,
            });

            return JSON.stringify(filterResult);
          } catch {
            const searchResult = await this.tokensService.search(query, limit);
            return JSON.stringify(searchResult);
          }
        }

        case 'fetch_discovery': {
          const category =
            typeof args.category === 'string' ? args.category : undefined;
          const sortBy = typeof args.sortBy === 'string' ? args.sortBy : undefined;

          const getTokens = (
            this.discoveryService as unknown as {
              getTokens?: (payload: {
                category?: string;
                sortBy?: string;
              }) => Promise<unknown>;
            }
          ).getTokens;

          if (getTokens) {
            const result = await getTokens({ category, sortBy });
            return JSON.stringify(result);
          }

          const fallback = await this.discoveryService.getTrending({
            sort_by:
              (sortBy as SortByTrending | undefined) ||
              SortByTrending.VOLUME_24H,
            time_frame: TimeFrame.TWENTY_FOUR_HOURS,
            limit: 5,
            offset: 0,
          });

          return JSON.stringify({
            warning: 'getTokens not available on DiscoveryService, returned trending fallback',
            category,
            data: fallback,
          });
        }

        case 'fetch_portfolio': {
          if (!walletAddress) {
            return JSON.stringify({ error: 'Wallet address required' });
          }

          const userId = String(args.userId || '');
          const walletAddresses = Array.isArray(args.walletAddresses)
            ? args.walletAddresses.filter(
                (value): value is string => typeof value === 'string',
              )
            : undefined;

          const data = await this.portfolioService.getOverview(userId, walletAddresses);
          return JSON.stringify(data);
        }

        case 'prepare_swap': {
          const inputMint = String(args.inputMint || '');
          const outputMint = String(args.outputMint || '');
          const amount = Number(args.amount || 0);

          return JSON.stringify({
            type: 'trade_intent',
            inputMint,
            outputMint,
            amount,
            confirmed: false,
          });
        }

        case 'navigate_to': {
          const route = String(args.route || '');
          const isAllowed =
            STATIC_ROUTES.includes(route) || TOKEN_ROUTE_REGEX.test(route);

          if (!isAllowed) {
            return '{"error": "Route not allowed"}';
          }

          return JSON.stringify({
            type: 'navigation',
            route,
          });
        }

        default:
          return JSON.stringify({ error: `Unknown tool: ${toolName}` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown tool error';
      this.logger.error(
        `Tool execution failed for ${toolName}: ${message}`,
        error instanceof Error ? error.stack : undefined,
        ChatService.name,
      );
      return JSON.stringify({ error: `Tool execution failed: ${toolName}` });
    }
  }

  parseResponse(content: string): ChatResponsePayload {
    if (!content) {
      return {
        sessionId: '',
        type: 'text',
        content: '',
      };
    }

    try {
      const parsed = JSON.parse(content) as Partial<ChatResponsePayload> &
        Record<string, unknown>;

      if (parsed.type && RESPONSE_TYPES.includes(parsed.type)) {
        const data =
          parsed.data && typeof parsed.data === 'object'
            ? parsed.data
            : Object.fromEntries(
                Object.entries(parsed).filter(
                  ([key]) => !['sessionId', 'type', 'content'].includes(key),
                ),
              );

        return {
          sessionId: '',
          type: parsed.type,
          content: typeof parsed.content === 'string' ? parsed.content : undefined,
          data,
        };
      }
    } catch {}

    return {
      sessionId: '',
      type: 'text',
      content,
    };
  }

  getOrCreateSession(sessionId: string): ChatSession {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      return existing;
    }

    const session: ChatSession = {
      messages: [],
      processing: false,
    };

    this.sessions.set(sessionId, session);
    return session;
  }
}

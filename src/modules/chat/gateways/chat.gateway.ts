import { Injectable } from '@nestjs/common';
import { Socket } from 'socket.io';
import { AppLoggerService } from '../../../common/logger/logger.service';
import { WebsocketGateway } from '../../../websocket/websocket.gateway';
import { ChatService } from '../services/chat.service';
import {
  SendMessagePayload,
  ChatErrorPayload,
  ChatResponsePayload,
} from '../types/chat.types';

@Injectable()
export class ChatGateway {
  private rateLimitMap = new Map<string, { count: number; windowStart: number }>();
  private readonly RATE_LIMIT = 20;
  private readonly WINDOW_MS = 60_000;

  constructor(
    private gateway: WebsocketGateway,
    private chatService: ChatService,
    private readonly logger: AppLoggerService,
  ) {
    this.gateway.register('chat:message', this.handleMessage.bind(this));
    this.logger.log('ChatGateway registered handler for chat:message', ChatGateway.name);
  }

  private async handleMessage(client: Socket, payload: SendMessagePayload) {
    const clientKey = client.id;
    const now = Date.now();
    const entry = this.rateLimitMap.get(clientKey);

    if (entry) {
      if (now - entry.windowStart < this.WINDOW_MS) {
        if (entry.count >= this.RATE_LIMIT) {
          this.logger.warn(
            `Rate limit exceeded for client=${clientKey} session=${payload.sessionId}`,
            ChatGateway.name,
          );
          const err: ChatErrorPayload = {
            sessionId: payload.sessionId,
            code: 'rate_limited',
            message: 'Rate limit exceeded. Please wait.',
          };
          client.emit('chat:error', err);
          return;
        }
        entry.count++;
      } else {
        entry.count = 1;
        entry.windowStart = now;
      }
    } else {
      this.rateLimitMap.set(clientKey, { count: 1, windowStart: now });
    }

    this.logger.log(
      `chat:message received client=${clientKey} session=${payload.sessionId}`,
      ChatGateway.name,
    );

    try {
      const result: ChatResponsePayload = await this.chatService.sendMessage(payload);
      client.emit('chat:response', result);
      client.emit('chat:complete', { sessionId: payload.sessionId });
      this.logger.log(
        `chat:response sent client=${clientKey} session=${payload.sessionId} type=${result.type}`,
        ChatGateway.name,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `chat:message handler failed client=${clientKey} session=${payload.sessionId}: ${message}`,
        error instanceof Error ? error.stack : undefined,
        ChatGateway.name,
      );
      const err: ChatErrorPayload = {
        sessionId: payload.sessionId,
        code: 'llm_error',
        message: 'Request failed',
      };
      client.emit('chat:error', err);
    }
  }
}

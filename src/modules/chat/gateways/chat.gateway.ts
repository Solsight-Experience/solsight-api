import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { AppLoggerService } from '../../../common/logger/logger.service';
import { WebsocketGateway } from '../../../websocket/websocket.gateway';
import { ChatService } from '../services/chat.service';
import { SendMessagePayload, ChatErrorPayload } from '../types/chat.types';

@Injectable()
export class ChatGateway {
  private rateLimitMap = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private readonly RATE_LIMIT = 20;
  private readonly WINDOW_MS = 60_000;

  constructor(
    private gateway: WebsocketGateway,
    private chatService: ChatService,
    private readonly jwtService: JwtService,
    private readonly logger: AppLoggerService,
  ) {
    this.gateway.register('chat:message', this.handleMessage.bind(this));
    this.logger.log(
      'ChatGateway registered handler for chat:message',
      ChatGateway.name,
    );
  }

  private extractUserId(client: Socket): string | undefined {
    const authToken = (client.handshake.auth as Record<string, unknown>)
      ?.token as string | undefined;

    const cookieHeader = client.handshake.headers.cookie;
    const cookieToken = cookieHeader
      ?.split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith('auth_token='))
      ?.split('=')[1];

    const token = authToken ?? cookieToken;
    if (!token) return undefined;

    try {
      const decoded = this.jwtService.verify<{ sub: string }>(token);
      return decoded.sub;
    } catch {
      this.logger.warn(
        `Invalid JWT in socket handshake for client=${client.id}`,
        ChatGateway.name,
      );
      return undefined;
    }
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

    const userId = this.extractUserId(client);

    this.logger.log(
      `chat:message received client=${clientKey} session=${payload.sessionId} userId=${userId ?? 'anonymous'}`,
      ChatGateway.name,
    );

    try {
      const response = await this.chatService.sendMessage({
        ...payload,
        userId: userId ?? payload.userId,
      });

      client.emit('chat:response', response);
      client.emit('chat:complete', { sessionId: payload.sessionId });
      this.logger.log(
        `chat:message completed client=${clientKey} session=${payload.sessionId}`,
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

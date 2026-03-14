import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { WebsocketGateway } from '../../../websocket/websocket.gateway';

@Injectable()
export class NotificationGateway {
  private readonly logger = new Logger(NotificationGateway.name);

  constructor(private readonly gateway: WebsocketGateway) {
    this.gateway.register('notification:subscribe', this.handleSubscribe.bind(this));
    this.gateway.register('notification:unsubscribe', this.handleUnsubscribe.bind(this));
  }

  handleSubscribe(client: Socket, payload: { userId: string }): void {
    if (!payload?.userId) {
      this.logger.warn('notification:subscribe called without userId');
      return;
    }

    const room = `user:${payload.userId}`;
    client.join(room);
    this.logger.debug(`Client ${client.id} joined room ${room}`);
  }

  handleUnsubscribe(client: Socket, payload: { userId: string }): void {
    if (!payload?.userId) {
      return;
    }

    const room = `user:${payload.userId}`;
    client.leave(room);
    this.logger.debug(`Client ${client.id} left room ${room}`);
  }
}

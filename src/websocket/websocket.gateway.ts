import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WebsocketGateway {
  @WebSocketServer()
  server: Server;

  emitTokenEvent(token: string, event: string, data: any) {
    this.server.to(token).emit(event, { token, data });
  }
  @SubscribeMessage('subscribe')
  handleSubscribe(client: Socket, payload: { token: string }) {
    client.join(payload.token);
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, payload: { token: string }) {
    client.leave(payload.token);
  }
}

import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class WebsocketGateway {
  @WebSocketServer()
  server: Server;

  emitEvent(event: string, payload: any) {
    this.server.emit(event, payload);
  }
}

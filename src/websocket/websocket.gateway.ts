import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: '*' } })
export class WebsocketGateway implements OnGatewayInit {
  @WebSocketServer()
  server: Server;

  private handlers = new Map<string, (client: Socket, payload: any) => void>();

  afterInit(server: Server) {
    server.on('connection', (client: Socket) => {
      client.onAny((event: string, payload: any) => {
        const handler = this.handlers.get(event);
        if (handler) {
          handler(client, payload);
        }
      });
    });
  }

  register(event: string, handler: (client: Socket, payload: any) => void) {
    this.handlers.set(event, handler);
  }

  emit(room: string, event: string, data: any) {
    this.server.to(room).emit(event, data);
  }

  getActiveRooms(prefix?: string): string[] {
    return Array.from(this.server.sockets.adapter.rooms.keys()).filter(
      (room) =>
        !this.server.sockets.sockets.has(room) &&
        (!prefix || room.startsWith(prefix)),
    );
  }
}

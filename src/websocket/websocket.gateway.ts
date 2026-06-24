import { WebSocketGateway, WebSocketServer, OnGatewayInit } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JsonValue } from "../common/types";

@WebSocketGateway({ cors: { origin: "*" } })
export class WebsocketGateway implements OnGatewayInit {
    @WebSocketServer()
    server: Server;

    private handlers = new Map<string, (client: Socket, payload: JsonValue) => void>();

    afterInit(server: Server) {
        server.on("connection", (client: Socket) => {
            client.onAny((event: string, ...payloads: JsonValue[]) => {
                const handler = this.handlers.get(event);
                if (handler) {
                    const payload = payloads[0] ?? null;
                    handler(client, payload);
                }
            });
        });
    }

    register<TPayload>(event: string, handler: (client: Socket, payload: TPayload) => void) {
        this.handlers.set(event, (client, payload) => handler(client, payload as TPayload));
    }

    emit<TData>(room: string, event: string, data: TData) {
        this.server.to(room).emit(event, data);
    }

    getActiveRooms(prefix?: string): string[] {
        return Array.from(this.server.sockets.adapter.rooms.keys()).filter(
            (room) => !this.server.sockets.sockets.has(room) && (!prefix || room.startsWith(prefix))
        );
    }
}

import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { WebSocketGateway, WebSocketServer, OnGatewayInit } from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { JsonValue } from "../common/types";
import { AppSocket } from "./websocket.types";

@Injectable()
@WebSocketGateway()
export class WebsocketGateway implements OnGatewayInit {
    @WebSocketServer()
    server: Server;

    private readonly logger = new Logger(WebsocketGateway.name);
    private handlers = new Map<string, (client: Socket, payload: JsonValue) => void>();

    constructor(private readonly jwtService: JwtService) {}

    afterInit(server: Server) {
        server.on("connection", (client: Socket) => {
            // handshake is a frozen snapshot for the connection's lifetime, so
            // re-verifying per event just fails once the short-lived token expires.
            (client as AppSocket).data.userId = this.authenticate(client);

            client.onAny((event: string, ...payloads: JsonValue[]) => {
                const handler = this.handlers.get(event);
                if (handler) {
                    const payload = payloads[0] ?? null;
                    handler(client, payload);
                }
            });
        });
    }

    private authenticate(client: Socket): string | undefined {
        const authToken = (client.handshake.auth as Record<string, unknown>)?.token as string | undefined;

        const cookieHeader = client.handshake.headers.cookie;
        const cookieToken = cookieHeader
            ?.split(";")
            .map((c) => c.trim())
            .find((c) => c.startsWith("auth_token="))
            ?.split("=")[1];

        for (const candidate of [authToken, cookieToken]) {
            if (!candidate) continue;
            try {
                const decoded = this.jwtService.verify<{ sub: string }>(candidate);
                return decoded.sub;
            } catch {
                continue;
            }
        }

        this.logger.warn(`No valid JWT in socket handshake for client=${client.id}`);
        return undefined;
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

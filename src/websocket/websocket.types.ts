import { DefaultEventsMap, Socket } from "socket.io";

export interface SocketData {
    userId?: string;
}

export type AppSocket = Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, SocketData>;

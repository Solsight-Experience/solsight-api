import { Socket } from "socket.io";
import { TokenSubscribeDto, TokenUnsubscribeDto } from "./token.dtos";
import { RoomFactory } from "./room/room.factory";
import { WebsocketGateway } from "../../../../websocket/websocket.gateway";
import { Injectable, Logger } from "@nestjs/common";
import { HolderTrackingService } from "./holder-tracking.service";

@Injectable()
export class TokenSocketGateway {
    private readonly logger = new Logger(TokenSocketGateway.name);
    constructor(
        private readonly gateway: WebsocketGateway,
        private readonly holderTracking: HolderTrackingService
    ) {
        this.gateway.register("token:subscribe", this.subscribe.bind(this));
        this.gateway.register("token:unsubscribe", this.unsubscribe.bind(this));
    }

    subscribe(client: Socket, payload: TokenSubscribeDto) {
        this.logger.log(`Client ${client.id} subscribing to token room with payload: ${JSON.stringify(payload)}`, TokenSocketGateway.name);
        try {
            const room = RoomFactory.create(payload);
            client.join(room);

            // Notify holder tracking service if this is a holders room
            if (room.startsWith("holders:")) {
                this.holderTracking.onHolderRoomJoin(room).catch((err) => {
                    this.logger.error("Error in holder room join:", err, TokenSocketGateway.name);
                });
            }
        } catch (error) {
            this.logger.error("Error in subscribe:", error, TokenSocketGateway.name);
        }
    }

    unsubscribe(client: Socket, payload: TokenUnsubscribeDto) {
        try {
            const room = RoomFactory.create(payload);
            client.leave(room);

            // Notify holder tracking service if this is a holders room
            if (room.startsWith("holders:")) {
                this.holderTracking.onHolderRoomLeave(room).catch((err) => {
                    this.logger.error("Error in holder room leave:", err, TokenSocketGateway.name);
                });
            }
        } catch (error) {
            this.logger.error("Error in unsubscribe:", error, TokenSocketGateway.name);
        }
    }

    listTokenRooms(domain: string) {
        return this.gateway.getActiveRooms(`${domain}:`);
    }

    emit(room: string, event: string, data: any) {
        this.gateway.emit(room, event, { room, data });
    }
}

import { Socket } from 'socket.io';
import { TokenSubscribeDto, TokenUnsubscribeDto } from './token.dtos';
import { RoomFactory } from './room/room.factory';
import { WebsocketGateway } from '../../../../websocket/websocket.gateway';
import { Injectable } from '@nestjs/common';
import { HolderTrackingService } from './holder-tracking.service';

@Injectable()
export class TokenSocketGateway {
  constructor(
    private readonly gateway: WebsocketGateway,
    private readonly holderTracking: HolderTrackingService,
  ) {
    this.gateway.register('token:subscribe', this.subscribe.bind(this));
    this.gateway.register('token:unsubscribe', this.unsubscribe.bind(this));
  }

  subscribe(client: Socket, payload: TokenSubscribeDto) {
    try {
      const room = RoomFactory.create(payload);
      client.join(room);

      // Notify holder tracking service if this is a holders room
      if (room.startsWith('holders:')) {
        this.holderTracking.onHolderRoomJoin(room).catch((err) => {
          console.error('Error in holder room join:', err);
        });
      }
    } catch (error) {
      console.error('Error in subscribe:', error);
    }
  }

  unsubscribe(client: Socket, payload: TokenUnsubscribeDto) {
    try {
      const room = RoomFactory.create(payload);
      client.leave(room);

      // Notify holder tracking service if this is a holders room
      if (room.startsWith('holders:')) {
        this.holderTracking.onHolderRoomLeave(room).catch((err) => {
          console.error('Error in holder room leave:', err);
        });
      }
    } catch (error) {
      console.error('Error in unsubscribe:', error);
    }
  }

  listTokenRooms(domain: string) {
    return this.gateway.getActiveRooms(`${domain}:`);
  }

  emit(room: string, event: string, data: any) {
    this.gateway.emit(room, event, { room, data });
  }
}

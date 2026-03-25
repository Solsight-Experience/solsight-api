// socket-subscribe.guard.ts
import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { RoomFactory } from "./room/room.factory";

export class TokenSubscribeGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const data = context.switchToWs().getData();

        if (!data?.domain || !data?.resource || !data?.interval) {
            return false;
        }

        if (typeof data.resource !== "string" || data.resource.length > 64) {
            return false;
        }

        return RoomFactory.isValid(data.domain, data.interval);
    }
}

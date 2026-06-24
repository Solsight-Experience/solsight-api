// socket-subscribe.guard.ts
import { CanActivate, ExecutionContext } from "@nestjs/common";
import { TokenSubscribeDto } from "./token.dtos";
import { RoomFactory } from "./room/room.factory";

export class TokenSubscribeGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const data = context.switchToWs().getData<TokenSubscribeDto>();

        if (!data?.domain || !data?.resource || !data?.interval) {
            return false;
        }

        if (typeof data.resource !== "string" || data.resource.length > 64) {
            return false;
        }

        return RoomFactory.isValid(data.domain, data.interval);
    }
}

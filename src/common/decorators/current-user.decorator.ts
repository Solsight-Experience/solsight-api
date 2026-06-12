import { createParamDecorator, ExecutionContext, UnauthorizedException } from "@nestjs/common";

export interface CurrentUserPayload {
    id: string;
    walletAddress?: string;
}

interface RequestWithCurrentUser {
    user?: Partial<CurrentUserPayload>;
}

export const CurrentUser = createParamDecorator((_: void, context: ExecutionContext): CurrentUserPayload => {
    const request = context.switchToHttp().getRequest<RequestWithCurrentUser>();
    const userId = request.user?.id;

    if (!userId) {
        throw new UnauthorizedException();
    }

    return {
        id: userId,
        walletAddress: request.user?.walletAddress
    };
});

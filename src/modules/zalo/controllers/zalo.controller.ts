import { Controller, Get, Post, Delete, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ZaloSubscriptionService } from "../services/zalo-subscription.service";
import { ZaloSubscriptionStatusDto, GenerateTokenResponseDto } from "../dtos/zalo-subscription.dto";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller("zalo")
@UseGuards(JwtAuthGuard)
export class ZaloController {
    constructor(private readonly subscriptionService: ZaloSubscriptionService) {}

    @Get("subscription")
    async getSubscription(@CurrentUser() user: CurrentUserPayload): Promise<ZaloSubscriptionStatusDto> {
        const sub = await this.subscriptionService.getSubscription(user.id);
        return {
            isVerified: sub?.isVerified ?? false,
            verificationToken: sub?.verificationToken ?? undefined,
            tokenExpiresAt: sub?.tokenExpiresAt?.toISOString() ?? undefined,
            verifiedAt: sub?.verifiedAt?.toISOString() ?? undefined
        };
    }

    @Get("subscription/status")
    async getStatus(@CurrentUser() user: CurrentUserPayload): Promise<ZaloSubscriptionStatusDto> {
        return this.getSubscription(user);
    }

    @Post("subscription/token")
    async generateToken(@CurrentUser() user: CurrentUserPayload): Promise<GenerateTokenResponseDto> {
        const sub = await this.subscriptionService.generateToken(user.id);
        return {
            verificationToken: sub.verificationToken!,
            tokenExpiresAt: sub.tokenExpiresAt!.toISOString(),
            instructions: `Send the code ${sub.verificationToken} to the SolSight Zalo OA bot to connect your account.`
        };
    }

    @Delete("subscription")
    async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<{ success: boolean }> {
        await this.subscriptionService.disconnect(user.id);
        return { success: true };
    }
}

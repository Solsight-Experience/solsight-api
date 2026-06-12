import { Controller, Get, Post, Delete, UseGuards, Request } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ZaloSubscriptionService } from "../services/zalo-subscription.service";
import { ZaloSubscriptionStatusDto, GenerateTokenResponseDto } from "../dtos/zalo-subscription.dto";
import { AuthenticatedRequest } from "../../../common/guards/guard.type";

@Controller("zalo")
@UseGuards(JwtAuthGuard)
export class ZaloController {
    constructor(private readonly subscriptionService: ZaloSubscriptionService) {}

    @Get("subscription")
    async getSubscription(@Request() req: AuthenticatedRequest): Promise<ZaloSubscriptionStatusDto> {
        const sub = await this.subscriptionService.getSubscription(req.user.id);
        return {
            isVerified: sub?.isVerified ?? false,
            verificationToken: sub?.verificationToken ?? undefined,
            tokenExpiresAt: sub?.tokenExpiresAt?.toISOString() ?? undefined,
            verifiedAt: sub?.verifiedAt?.toISOString() ?? undefined
        };
    }

    @Get("subscription/status")
    async getStatus(@Request() req: AuthenticatedRequest): Promise<ZaloSubscriptionStatusDto> {
        return this.getSubscription(req);
    }

    @Post("subscription/token")
    async generateToken(@Request() req: AuthenticatedRequest): Promise<GenerateTokenResponseDto> {
        const sub = await this.subscriptionService.generateToken(req.user.id);
        return {
            verificationToken: sub.verificationToken!,
            tokenExpiresAt: sub.tokenExpiresAt!.toISOString(),
            instructions: `Send the code ${sub.verificationToken} to the SolSight Zalo OA bot to connect your account.`
        };
    }

    @Delete("subscription")
    async disconnect(@Request() req: AuthenticatedRequest): Promise<{ success: boolean }> {
        await this.subscriptionService.disconnect(req.user.id);
        return { success: true };
    }
}

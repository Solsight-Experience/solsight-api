import { Controller, Get, Post, Delete, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { TelegramSubscriptionService } from "../services/telegram-subscription.service";
import { TelegramSubscriptionStatusDto, GenerateTelegramTokenResponseDto } from "../dtos/telegram-subscription.dto";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller("telegram")
@UseGuards(JwtAuthGuard)
export class TelegramController {
    constructor(private readonly subscriptionService: TelegramSubscriptionService) {}

    @Get("subscription")
    async getSubscription(@CurrentUser() user: CurrentUserPayload): Promise<TelegramSubscriptionStatusDto> {
        const sub = await this.subscriptionService.getSubscription(user.id);
        return {
            isVerified: sub?.isVerified ?? false,
            verificationToken: sub?.verificationToken ?? undefined,
            tokenExpiresAt: sub?.tokenExpiresAt?.toISOString() ?? undefined,
            verifiedAt: sub?.verifiedAt?.toISOString() ?? undefined
        };
    }

    @Get("subscription/status")
    async getStatus(@CurrentUser() user: CurrentUserPayload): Promise<TelegramSubscriptionStatusDto> {
        return this.getSubscription(user);
    }

    @Post("subscription/token")
    async generateToken(@CurrentUser() user: CurrentUserPayload): Promise<GenerateTelegramTokenResponseDto> {
        const sub = await this.subscriptionService.generateToken(user.id);
        return {
            verificationToken: sub.verificationToken!,
            tokenExpiresAt: sub.tokenExpiresAt!.toISOString(),
            instructions: `Send the code ${sub.verificationToken} to the SolSight Telegram bot to connect your account.`
        };
    }

    @Delete("subscription")
    async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<{ success: boolean }> {
        await this.subscriptionService.disconnect(user.id);
        return { success: true };
    }
}

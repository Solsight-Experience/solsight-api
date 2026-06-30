import { Controller, Get, Post, Delete, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { BotService } from "../services/bot.service";
import { BotSubscriptionStatusDto, GenerateBotTokenResponseDto } from "../dtos/bot-subscription.dto";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller("telegram")
@UseGuards(JwtAuthGuard)
export class BotController {
    constructor(private readonly botService: BotService) {}

    @Get("subscription")
    async getSubscription(@CurrentUser() user: CurrentUserPayload): Promise<BotSubscriptionStatusDto> {
        const sub = await this.botService.getSubscription(user.id);
        return {
            isVerified: sub?.isVerified ?? false,
            verificationToken: sub?.verificationToken ?? undefined,
            tokenExpiresAt: sub?.tokenExpiresAt?.toISOString() ?? undefined,
            verifiedAt: sub?.verifiedAt?.toISOString() ?? undefined
        };
    }

    @Get("subscription/status")
    async getStatus(@CurrentUser() user: CurrentUserPayload): Promise<BotSubscriptionStatusDto> {
        return this.getSubscription(user);
    }

    @Post("subscription/token")
    async generateToken(@CurrentUser() user: CurrentUserPayload): Promise<GenerateBotTokenResponseDto> {
        const sub = await this.botService.generateToken(user.id);
        return {
            verificationToken: sub.verificationToken!,
            tokenExpiresAt: sub.tokenExpiresAt!.toISOString(),
            instructions: `Send the code ${sub.verificationToken} to the SolSight Telegram bot to connect your account.`
        };
    }

    @Delete("subscription")
    async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<{ success: boolean }> {
        await this.botService.disconnect(user.id);
        return { success: true };
    }
}

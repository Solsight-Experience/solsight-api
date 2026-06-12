import { Controller, Get, Post, Delete, Body, Query, UseGuards, Res, BadRequestException } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { EmailSubscriptionService } from "../services/email-subscription.service";
import { EmailSubscriptionStatusDto, SubmitEmailDto } from "../dtos/email-subscription.dto";
import { ConfigService } from "@nestjs/config";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller("email")
export class EmailController {
    private readonly verifyBaseUrl: string;

    constructor(
        private readonly subscriptionService: EmailSubscriptionService,
        config: ConfigService
    ) {
        this.verifyBaseUrl = config.get<string>("email.verifyBaseUrl") ?? "http://localhost:3000";
    }

    @Get("subscription/status")
    @UseGuards(JwtAuthGuard)
    async getStatus(@CurrentUser() user: CurrentUserPayload): Promise<EmailSubscriptionStatusDto> {
        return this.getSubscription(user);
    }

    @Get("subscription")
    @UseGuards(JwtAuthGuard)
    async getSubscription(@CurrentUser() user: CurrentUserPayload): Promise<EmailSubscriptionStatusDto> {
        const sub = await this.subscriptionService.getSubscription(user.id);
        return {
            isVerified: sub?.isVerified ?? false,
            email: sub?.email ?? undefined,
            verifiedAt: sub?.verifiedAt?.toISOString() ?? undefined
        };
    }

    @Post("subscription")
    @UseGuards(JwtAuthGuard)
    async submitEmail(@CurrentUser() user: CurrentUserPayload, @Body() body: SubmitEmailDto): Promise<{ success: boolean }> {
        await this.subscriptionService.initiateVerification(user.id, body.email);
        return { success: true };
    }

    @Get("verify")
    async verifyEmail(@Query("token") token: string, @Res() res: Response): Promise<void> {
        if (!token) throw new BadRequestException("Missing token");
        const userId = await this.subscriptionService.verifyToken(token);
        if (!userId) throw new BadRequestException("Invalid or expired token");
        res.redirect(`${this.verifyBaseUrl}/wallet-tracker?emailVerified=true`);
    }

    @Delete("subscription")
    @UseGuards(JwtAuthGuard)
    async disconnect(@CurrentUser() user: CurrentUserPayload): Promise<{ success: boolean }> {
        await this.subscriptionService.disconnect(user.id);
        return { success: true };
    }
}

import { Controller, Get, Post, Delete, Body, Query, UseGuards, Request, Res, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { EmailSubscriptionService } from '../services/email-subscription.service';
import { User } from '../../users/entities/user.entity';
import { EmailSubscriptionStatusDto, SubmitEmailDto } from '../dtos/email-subscription.dto';
import { ConfigService } from '@nestjs/config';

interface AuthenticatedRequest extends Request {
    user: User;
}

@Controller('email')
export class EmailController {
    private readonly verifyBaseUrl: string;

    constructor(
        private readonly subscriptionService: EmailSubscriptionService,
        config: ConfigService,
    ) {
        this.verifyBaseUrl = config.get<string>('email.verifyBaseUrl') ?? 'http://localhost:3000';
    }

    @Get('subscription/status')
    @UseGuards(JwtAuthGuard)
    async getStatus(@Request() req: AuthenticatedRequest): Promise<EmailSubscriptionStatusDto> {
        return this.getSubscription(req);
    }

    @Get('subscription')
    @UseGuards(JwtAuthGuard)
    async getSubscription(@Request() req: AuthenticatedRequest): Promise<EmailSubscriptionStatusDto> {
        const sub = await this.subscriptionService.getSubscription(req.user.id);
        return {
            isVerified: sub?.isVerified ?? false,
            email: sub?.email ?? undefined,
            verifiedAt: sub?.verifiedAt?.toISOString() ?? undefined,
        };
    }

    @Post('subscription')
    @UseGuards(JwtAuthGuard)
    async submitEmail(
        @Request() req: AuthenticatedRequest,
        @Body() body: SubmitEmailDto,
    ): Promise<{ success: boolean }> {
        await this.subscriptionService.initiateVerification(req.user.id, body.email);
        return { success: true };
    }

    @Get('verify')
    async verifyEmail(
        @Query('token') token: string,
        @Res() res: Response,
    ): Promise<void> {
        if (!token) throw new BadRequestException('Missing token');
        const userId = await this.subscriptionService.verifyToken(token);
        if (!userId) throw new BadRequestException('Invalid or expired token');
        res.redirect(`${this.verifyBaseUrl}/wallet-tracker?emailVerified=true`);
    }

    @Delete('subscription')
    @UseGuards(JwtAuthGuard)
    async disconnect(@Request() req: AuthenticatedRequest): Promise<{ success: boolean }> {
        await this.subscriptionService.disconnect(req.user.id);
        return { success: true };
    }
}

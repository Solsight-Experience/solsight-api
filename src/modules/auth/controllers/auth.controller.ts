import { Controller, Post, Body, UseGuards, Get, Request, Query, Res, HttpException, HttpStatus } from "@nestjs/common";
import { VerifySolanaDto } from "../dtos/verify-solana.dto";
import { AuthService } from "../services/auth.service";
import { LoginDto, OauthLoginDto, RegisterDto } from "../types/auth.types";
import { JwtAuthGuard } from "../guards/jwt-auth.guard";
import { Response } from "express";
import { AuthenticatedRequest } from "../../../common/guards/guard.type";

@Controller("auth")
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post("login")
    async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
        const { user, accessToken } = await this.authService.login(dto);

        res.cookie("auth_token", accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/",
            // KHÔNG có domain
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return { user };
    }

    @Post("logout")
    logout(@Res({ passthrough: true }) res: Response) {
        res.clearCookie("auth_token", {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/"
        });
        res.cookie("auth_token", "", {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/",
            maxAge: 0
        });

        return { message: "Logged out successfully" };
    }
    @Post("oauth-login")
    async oauthLogin(@Body() dto: OauthLoginDto, @Res({ passthrough: true }) res: Response) {
        try {
            const { user, accessToken } = await this.authService.handleOauthLogin(dto);

            res.cookie("auth_token", accessToken, {
                httpOnly: true,
                sameSite: "lax",
                maxAge: 7 * 24 * 60 * 60 * 1000,
                secure: process.env.NODE_ENV === "production",
                path: "/"
            });

            return { user, message: "Login successful" };
        } catch (error) {
            const message = error instanceof Error ? error.message : "OAuth login failed";
            throw new HttpException(message, HttpStatus.BAD_REQUEST);
        }
    }
    @Post("register")
    async register(@Body() registerDto: RegisterDto, @Res({ passthrough: true }) res: Response) {
        const { user, accessToken } = await this.authService.register(registerDto);

        res.cookie("auth_token", accessToken, {
            httpOnly: true,
            secure: false,
            sameSite: "lax",
            path: "/",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        return { user };
    }

    @Get("solana/nonce")
    async getSolanaNonce(@Query("walletAddress") walletAddress: string) {
        return await this.authService.getSolanaNonce(walletAddress);
    }

    @UseGuards(JwtAuthGuard)
    @Post("solana/verify")
    async verifySolanaWallet(@Body() verifySolanaDto: VerifySolanaDto, @Request() req: AuthenticatedRequest) {
        return await this.authService.verifySolanaWallet(verifySolanaDto.walletAddress, verifySolanaDto.signature, verifySolanaDto.walletIcon, req.user.id);
    }
}

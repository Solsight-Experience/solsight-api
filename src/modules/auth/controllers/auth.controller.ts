import { Controller, Post, Body, UseGuards, Get, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { AuthService, LoginDto, RegisterDto } from '../services/auth.service';
import { VerifySolanaDto } from '../dtos/verify-solana.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('signup')
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Get('solana/nonce')
  async getSolanaNonce(@Query('walletAddress') walletAddress: string) {
    return await this.authService.getSolanaNonce(walletAddress);
  }

  @UseGuards(JwtAuthGuard)
  @Post('solana/verify')
  async verifySolanaWallet(@Body() verifySolanaDto: VerifySolanaDto, @Request() req) {
    return await this.authService.verifySolanaWallet(
      verifySolanaDto.walletAddress,
      verifySolanaDto.signature,
      verifySolanaDto.walletIcon,
      req.user.id
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile(@Request() req: any) {
    return req.user;
  }
}

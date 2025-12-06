import { Controller, Post, Body, UseGuards, Get, Request, Res, Req } from '@nestjs/common';
import { AuthService, LoginDto } from '../services/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { Response } from 'express';
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response
  ) {
    const { user, accessToken } = await this.authService.login(dto);

    res.cookie('auth_token', accessToken, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      // KHÔNG có domain
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    // Thử cả 2 cách cùng lúc
    res.clearCookie('auth_token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      // KHÔNG có domain
    });

    // Backup: set cookie rỗng với maxAge = 0
    res.cookie('auth_token', '', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return { message: 'Logged out successfully' };
  }
}

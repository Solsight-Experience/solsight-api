import { Controller, Get, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PortfolioService } from '../services/portfolio.service';
import { User } from '../../users/entities/user.entity';

interface AuthenticatedRequest extends Request {
  user: User;
}

@Controller({ path: 'portfolio', version: '1' })
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @UseGuards(JwtAuthGuard)
  @Get('overview')
  async getOverview(
    @Request() req: AuthenticatedRequest,
    @Query('wallet_addresses') walletAddresses: string[],
    @Query('time_frame') timeFrame: string,
  ) {
    return this.portfolioService.getOverview(req.user.id, walletAddresses, timeFrame);
  }

  @UseGuards(JwtAuthGuard)
  @Get('pnl-chart')
  async getPnlChart(
    @Request() req: AuthenticatedRequest,
    @Query('wallet_addresses') walletAddresses: string[],
    @Query('time_frame') timeFrame: string,
    @Query('interval') interval: string,
  ) {
    return this.portfolioService.getPnlChart(req.user.id, walletAddresses, timeFrame, interval);
  }

  @UseGuards(JwtAuthGuard)
  @Get('positions')
  async getPositions(
    @Request() req: AuthenticatedRequest,
    @Query('wallet_address') walletAddress: string,
    @Query('sort_by') sortBy: string,
    @Query('show_zero_balance') showZeroBalance: boolean,
  ) {
    return this.portfolioService.getPositions(req.user.id, walletAddress, sortBy, showZeroBalance);
  }

  @UseGuards(JwtAuthGuard)
  @Get('activities')
  async getActivities(
    @Request() req: AuthenticatedRequest,
    @Query('wallet_address') walletAddress: string,
    @Query('type') type: string = 'all',
    @Query('limit') limit: number = 50,
    @Query('before') before?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    if (!walletAddress) {
      throw new BadRequestException('walletAddress is required');
    }
    return this.portfolioService.getActivities(req.user.id, walletAddress, type, limit, before);
  }

  @UseGuards(JwtAuthGuard)
  @Get('performance')
  async getPerformance(
    @Request() req: AuthenticatedRequest,
    @Query('wallet_addresses') walletAddresses: string[],
    @Query('time_frame') timeFrame: string,
  ) {
    return this.portfolioService.getPerformance(req.user.id, walletAddresses, timeFrame);
  }
}

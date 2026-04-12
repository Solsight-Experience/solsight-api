import { Controller, Get, Query, UseGuards, Request, BadRequestException } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PortfolioService } from "../services/portfolio.service";
import { User } from "../../users/entities/user.entity";

interface AuthenticatedRequest extends Request {
    user: User;
}

@Controller({ path: "portfolio" })
export class PortfolioController {
    constructor(private readonly portfolioService: PortfolioService) {}

    @UseGuards(JwtAuthGuard)
    @Get("overview")
    async getOverview(@Request() req: AuthenticatedRequest, @Query("wallet_addresses") walletAddresses: string[], @Query("time_frame") timeFrame: string) {
        return this.portfolioService.getOverview(req.user.id, walletAddresses, timeFrame);
    }

    @UseGuards(JwtAuthGuard)
    @Get("pnl-chart")
    async getPnlChart(
        @Request() req: AuthenticatedRequest,
        @Query("wallet_addresses") walletAddresses: string[],
        @Query("wallet_address") walletAddress: string,
        @Query("time_frame") timeFrame: string,
        @Query("interval") interval: string
    ) {
        const addresses = walletAddresses || (walletAddress ? [walletAddress] : []);
        return this.portfolioService.getPnlChart(req.user.id, addresses, timeFrame, interval);
    }

    @UseGuards(JwtAuthGuard)
    @Get("positions")
    async getPositions(
        @Request() req: AuthenticatedRequest,
        @Query("wallet_address") walletAddress: string,
        @Query("sort_by") sortBy: string,
        @Query("show_zero_balance") showZeroBalance: boolean
    ) {
        return this.portfolioService.getPositions(req.user.id, walletAddress, sortBy, showZeroBalance);
    }

    @UseGuards(JwtAuthGuard)
    @Get("activities")
    async getActivities(
        @Request() req: AuthenticatedRequest,
        @Query("wallet_address") walletAddress?: string,
        @Query("type") type: string = "all",
        @Query("limit") limit: number = 50,
        @Query("before") before?: string,
        @Query("from") from?: number,
        @Query("to") to?: number
    ) {
        return this.portfolioService.getActivities(req.user.id, walletAddress, type, limit, before, from, to);
    }

    @UseGuards(JwtAuthGuard)
    @Get("performance")
    async getPerformance(@Request() req: AuthenticatedRequest, @Query("wallet_addresses") walletAddresses: string[], @Query("time_frame") timeFrame: string) {
        return this.portfolioService.getPerformance(req.user.id, walletAddresses, timeFrame);
    }

    // ── Watch routes: arbitrary wallet, no ownership check ───────────────────

    @UseGuards(JwtAuthGuard)
    @Get("watch/overview")
    async getWatchOverview(@Query("wallet_address") walletAddress: string, @Query("time_frame") timeFrame?: string) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getOverviewByAddress(walletAddress, timeFrame);
    }

    @UseGuards(JwtAuthGuard)
    @Get("watch/positions")
    async getWatchPositions(
        @Query("wallet_address") walletAddress: string,
        @Query("sort_by") sortBy?: string,
        @Query("show_zero_balance") showZeroBalance?: boolean
    ) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getPositionsByAddress(walletAddress, sortBy, showZeroBalance);
    }

    @UseGuards(JwtAuthGuard)
    @Get("watch/activities")
    async getWatchActivities(
        @Query("wallet_address") walletAddress: string,
        @Query("type") type?: string,
        @Query("limit") limit?: number,
        @Query("before") before?: string,
        @Query("from") from?: number,
        @Query("to") to?: number
    ) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getActivitiesByAddress(walletAddress, type, limit, before, from, to);
    }

    @UseGuards(JwtAuthGuard)
    @Get("watch/pnl-chart")
    async getWatchPnlChart(
        @Query("wallet_address") walletAddress: string,
        @Query("time_frame") timeFrame?: string,
        @Query("interval") interval?: string
    ) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getPnlChartByAddress(walletAddress, timeFrame, interval);
    }
}

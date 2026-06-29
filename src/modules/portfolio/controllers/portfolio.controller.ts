import { Controller, Get, Query, UseGuards, BadRequestException } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { PortfolioService } from "../services/portfolio.service";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Controller({ path: "portfolio" })
export class PortfolioController {
    constructor(private readonly portfolioService: PortfolioService) {}

    @UseGuards(JwtAuthGuard)
    @Get("overview")
    async getOverview(
        @RequestCluster() cluster: Cluster,
        @CurrentUser() user: CurrentUserPayload,
        @Query("wallet_addresses") walletAddresses: string[],
        @Query("time_frame") timeFrame: string
    ) {
        return this.portfolioService.getOverview(cluster, user.id, walletAddresses, timeFrame);
    }

    @UseGuards(JwtAuthGuard)
    @Get("pnl-chart")
    async getPnlChart(
        @RequestCluster() cluster: Cluster,
        @CurrentUser() user: CurrentUserPayload,
        @Query("wallet_addresses") walletAddresses: string[],
        @Query("wallet_address") walletAddress: string,
        @Query("time_frame") timeFrame: string,
        @Query("interval") interval: string
    ) {
        const addresses = walletAddresses || (walletAddress ? [walletAddress] : []);
        return this.portfolioService.getPnlChart(cluster, user.id, addresses, timeFrame, interval);
    }

    @UseGuards(JwtAuthGuard)
    @Get("positions")
    async getPositions(
        @RequestCluster() cluster: Cluster,
        @CurrentUser() user: CurrentUserPayload,
        @Query("wallet_address") walletAddress: string,
        @Query("sort_by") sortBy: string,
        @Query("show_zero_balance") showZeroBalance: boolean
    ) {
        return this.portfolioService.getPositions(cluster, user.id, walletAddress, sortBy, showZeroBalance);
    }

    @UseGuards(JwtAuthGuard)
    @Get("activities")
    async getActivities(
        @RequestCluster() cluster: Cluster,
        @CurrentUser() user: CurrentUserPayload,
        @Query("wallet_address") walletAddress?: string,
        @Query("type") type: string = "all",
        @Query("limit") limit: number = 50,
        @Query("before") before?: string,
        @Query("from") from?: number,
        @Query("to") to?: number
    ) {
        return this.portfolioService.getActivities(cluster, user.id, walletAddress, type, limit, before, from, to);
    }

    @UseGuards(JwtAuthGuard)
    @Get("performance")
    async getPerformance(
        @RequestCluster() cluster: Cluster,
        @CurrentUser() user: CurrentUserPayload,
        @Query("wallet_addresses") walletAddresses: string[],
        @Query("time_frame") timeFrame: string
    ) {
        return this.portfolioService.getPerformance(cluster, user.id, walletAddresses, timeFrame);
    }

    // ── Watch routes: arbitrary wallet, no ownership check ───────────────────

    @UseGuards(JwtAuthGuard)
    @Get("watch/overview")
    async getWatchOverview(@RequestCluster() cluster: Cluster, @Query("wallet_address") walletAddress: string, @Query("time_frame") timeFrame?: string) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getOverviewByAddress(cluster, walletAddress, timeFrame);
    }

    @UseGuards(JwtAuthGuard)
    @Get("watch/positions")
    async getWatchPositions(
        @RequestCluster() cluster: Cluster,
        @Query("wallet_address") walletAddress: string,
        @Query("sort_by") sortBy?: string,
        @Query("show_zero_balance") showZeroBalance?: boolean
    ) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getPositionsByAddress(cluster, walletAddress, sortBy, showZeroBalance);
    }

    @UseGuards(JwtAuthGuard)
    @Get("watch/activities")
    async getWatchActivities(
        @RequestCluster() cluster: Cluster,
        @Query("wallet_address") walletAddress: string,
        @Query("type") type?: string,
        @Query("limit") limit?: number,
        @Query("before") before?: string,
        @Query("from") from?: number,
        @Query("to") to?: number
    ) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getActivitiesByAddress(cluster, walletAddress, type, limit, before, from, to);
    }

    @UseGuards(JwtAuthGuard)
    @Get("watch/pnl-chart")
    async getWatchPnlChart(
        @RequestCluster() cluster: Cluster,
        @Query("wallet_address") walletAddress: string,
        @Query("time_frame") timeFrame?: string,
        @Query("interval") interval?: string
    ) {
        if (!walletAddress) throw new BadRequestException("wallet_address is required");
        return this.portfolioService.getPnlChartByAddress(cluster, walletAddress, timeFrame, interval);
    }
}

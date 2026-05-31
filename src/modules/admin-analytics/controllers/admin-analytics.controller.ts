import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AdminAnalyticsService } from "../services/admin-analytics.service";
import { AnalyticsQueryDto } from "../dtos/analytics-query.dto";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { UserRole } from "../../users/entities/user.entity";

@Controller("admin/analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAnalyticsController {
    constructor(private readonly analyticsService: AdminAnalyticsService) {}

    @Get("overview")
    async getOverview(@Query() query: AnalyticsQueryDto) {
        return this.analyticsService.getOverview(query);
    }

    @Get("users-over-time")
    async getUsersOverTime(@Query() query: AnalyticsQueryDto) {
        return this.analyticsService.getUsersOverTime(query);
    }

    @Get("swaps-over-time")
    async getSwapsOverTime(@Query() query: AnalyticsQueryDto) {
        return this.analyticsService.getSwapsOverTime(query);
    }

    @Get("top-pairs")
    async getTopPairs(@Query() query: AnalyticsQueryDto) {
        return this.analyticsService.getTopPairs(query);
    }

    @Get("top-tokens")
    async getTopTokens(@Query() query: AnalyticsQueryDto) {
        return this.analyticsService.getTopTokens(query);
    }

    @Get("recent-swaps")
    async getRecentSwaps(@Query() query: AnalyticsQueryDto) {
        return this.analyticsService.getRecentSwaps(query);
    }

    @Get("volume-by-pair")
    async getVolumeByPair(@Query() query: AnalyticsQueryDto) {
        return this.analyticsService.getVolumeByPair(query);
    }
}

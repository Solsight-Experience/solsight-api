import { Controller, Get, Param, Query, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { DiscoveryService } from "../services/discovery.service";
import { GetTrendingDto } from "../dtos/get-trending.dto";
import { GetNewListingsDto } from "../dtos/get-new-listings.dto";
import { GetGainersLosersDto } from "../dtos/get-gainers-losers.dto";
import { GetCategoryDto } from "../dtos/get-category.dto";
import { OptionalJwtAuthGuard } from "../../../common/guards/optional-jwt-auth.guard";
import { CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

interface RequestWithOptionalUser {
    user?: Partial<CurrentUserPayload>;
}

@Controller("discovery")
export class DiscoveryController {
    constructor(private readonly discoveryService: DiscoveryService) {}

    @Get("trending")
    @UseGuards(OptionalJwtAuthGuard)
    async getTrending(@Query() dto: GetTrendingDto, @Req() req: RequestWithOptionalUser) {
        if (dto.isFavourite && !req.user?.id) {
            throw new UnauthorizedException("Access token required");
        }
        return this.discoveryService.getTrending(dto, req.user?.id);
    }

    @Get("new-listings")
    async getNewListings(@Query() dto: GetNewListingsDto) {
        return this.discoveryService.getNewListings(dto);
    }

    @Get("categories")
    async getCategories(@Query() dto: GetCategoryDto) {
        return this.discoveryService.getCategories(dto);
    }

    @Get("categories/sync")
    async syncCategories() {
        await this.discoveryService.syncCategories();
        return { message: "Categories synced successfully" };
    }

    @Get("categories/:slug")
    async getCategoryDetail(@Param("slug") slug: string, @Query() dto: GetCategoryDto) {
        return this.discoveryService.getCategoryDetail(slug, dto);
    }

    @Get("gainers-losers")
    async getGainersLosers(@Query() dto: GetGainersLosersDto) {
        return this.discoveryService.getGainersLosers(dto);
    }
}

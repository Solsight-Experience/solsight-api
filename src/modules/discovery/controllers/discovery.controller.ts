import { Controller, Get, Param, Query } from "@nestjs/common";
import { DiscoveryService } from "../services/discovery.service";
import { GetTrendingDto } from "../dtos/get-trending.dto";
import { GetNewListingsDto } from "../dtos/get-new-listings.dto";
import { GetGainersLosersDto } from "../dtos/get-gainers-losers.dto";
import { GetCategoryDto } from "../dtos/get-category.dto";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Controller("discovery")
export class DiscoveryController {
    constructor(private readonly discoveryService: DiscoveryService) {}

    @Get("trending")
    async getTrending(@RequestCluster() cluster: Cluster, @Query() dto: GetTrendingDto) {
        return this.discoveryService.getTrending(cluster, dto);
    }

    @Get("new-listings")
    async getNewListings(@RequestCluster() cluster: Cluster, @Query() dto: GetNewListingsDto) {
        return this.discoveryService.getNewListings(cluster, dto);
    }

    @Get("categories")
    async getCategories(@RequestCluster() cluster: Cluster, @Query() dto: GetCategoryDto) {
        return this.discoveryService.getCategories(cluster, dto);
    }

    @Get("categories/sync")
    async syncCategories(@RequestCluster() cluster: Cluster) {
        await this.discoveryService.syncCategoriesForCluster(cluster);
        return { message: "Categories synced successfully" };
    }

    @Get("categories/:slug")
    async getCategoryDetail(@RequestCluster() cluster: Cluster, @Param("slug") slug: string, @Query() dto: GetCategoryDto) {
        return this.discoveryService.getCategoryDetail(cluster, slug, dto);
    }

    @Get("gainers-losers")
    async getGainersLosers(@RequestCluster() cluster: Cluster, @Query() dto: GetGainersLosersDto) {
        return this.discoveryService.getGainersLosers(cluster, dto);
    }
}

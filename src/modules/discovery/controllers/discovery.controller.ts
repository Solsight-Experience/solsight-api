import { Controller, Get, Param, Query } from '@nestjs/common';
import { DiscoveryService } from '../services/discovery.service';
import { GetTrendingDto } from '../dtos/get-trending.dto';
import { GetNewListingsDto } from '../dtos/get-new-listings.dto';
import { GetGainersLosersDto } from '../dtos/get-gainers-losers.dto';
import { GetCategoryDto } from '../dtos/get-category.dto';

@Controller('discovery')
export class DiscoveryController {
  constructor(private readonly discoveryService: DiscoveryService) {}

  @Get('trending')
  async getTrending(@Query() dto: GetTrendingDto) {
    return this.discoveryService.getTrending(dto);
  }

  @Get('new-listings')
  async getNewListings(@Query() dto: GetNewListingsDto) {
    return this.discoveryService.getNewListings(dto);
  }

  @Get('categories')
  async getCategories() {
    return this.discoveryService.getCategories();
  }

  @Get('categories/:slug')
  async getCategoryDetail(
    @Param('slug') slug: string,
    @Query() dto: GetCategoryDto,
  ) {
    return this.discoveryService.getCategoryDetail(slug, dto);
  }

  @Get('gainers-losers')
  async getGainersLosers(@Query() dto: GetGainersLosersDto) {
    return this.discoveryService.getGainersLosers(dto);
  }
}

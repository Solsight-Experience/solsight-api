import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../../tokens/entities/token.entity';
import { Category } from '../../tokens/entities/category.entity';
import {
  GetTrendingDto,
  SortByTrending,
  TimeFrame,
} from '../dtos/get-trending.dto';
import { GetNewListingsDto } from '../dtos/get-new-listings.dto';
import {
  GetGainersLosersDto,
  GainersLosersType,
} from '../dtos/get-gainers-losers.dto';
import { GetCategoryDto } from '../dtos/get-category.dto';

@Injectable()
export class DiscoveryService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
  ) {}

  async getTrending(dto: GetTrendingDto) {
    const { sort_by, time_frame, limit, offset } = dto;

    let orderBy: { [key: string]: 'DESC' | 'ASC' } = {};

    switch (sort_by) {
      case SortByTrending.VOLUME_24H:
        orderBy = { volume24h: 'DESC' };
        break;
      case SortByTrending.TXNS_24H:
        orderBy = { txns24hTotal: 'DESC' };
        break;
      case SortByTrending.PRICE_CHANGE_24H:
        orderBy = { priceChange24h: 'DESC' };
        break;
      case SortByTrending.MARKET_CAP:
        orderBy = { marketCap: 'DESC' };
        break;
      case SortByTrending.HOLDERS_CHANGE:
        orderBy = { holdersChange24h: 'DESC' };
        break;
      default:
        orderBy = { volume24h: 'DESC' };
    }

    const [tokens, total] = await this.tokenRepository.findAndCount({
      order: orderBy,
      take: limit,
      skip: offset,
      relations: ['category'],
    });

    return {
      tokens,
      total,
      updated_at: new Date().toISOString(),
    };
  }

  async getNewListings(dto: GetNewListingsDto) {
    const { time_frame, min_liquidity, limit, offset } = dto;

    let ageThresholdSeconds = 86400; // 24h default
    if (time_frame === TimeFrame.SEVEN_DAYS) {
      ageThresholdSeconds = 604800; // 7 days
    }

    const query = this.tokenRepository
      .createQueryBuilder('token')
      .where('token.ageSeconds <= :ageThreshold', {
        ageThreshold: ageThresholdSeconds,
      })
      .orderBy('token.createdAt', 'DESC');

    if (min_liquidity !== undefined) {
      query.andWhere('token.liquidity >= :minLiquidity', {
        minLiquidity: min_liquidity,
      });
    }

    query.take(limit).skip(offset);

    const [tokens, total] = await query.getManyAndCount();

    return {
      tokens,
      total,
    };
  }

  async getCategories() {
    const categories = await this.categoryRepository.find({
      order: { marketCap: 'DESC' },
    });

    return {
      categories,
    };
  }

  async getCategoryDetail(categorySlug: string, dto: GetCategoryDto) {
    const { sort_by, limit, offset } = dto;

    const category = await this.categoryRepository.findOne({
      where: { slug: categorySlug },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    let orderBy: { [key: string]: 'DESC' | 'ASC' } = { marketCap: 'DESC' };
    if (sort_by) {
      orderBy = { [sort_by]: 'DESC' };
    }

    const [tokens, total] = await this.tokenRepository.findAndCount({
      where: { categoryId: category.id },
      order: orderBy,
      take: limit,
      skip: offset,
    });

    return {
      category,
      tokens,
      total,
    };
  }

  async getGainersLosers(dto: GetGainersLosersDto) {
    const { type, limit } = dto;

    let gainers: Token[] = [];
    let losers: Token[] = [];

    if (type === GainersLosersType.GAINERS || type === GainersLosersType.BOTH) {
      gainers = await this.tokenRepository.find({
        where: {},
        order: { priceChange24h: 'DESC' },
        take: limit,
      });
    }

    if (type === GainersLosersType.LOSERS || type === GainersLosersType.BOTH) {
      losers = await this.tokenRepository.find({
        where: {},
        order: { priceChange24h: 'ASC' },
        take: limit,
      });
    }

    return {
      gainers,
      losers,
      updated_at: new Date().toISOString(),
    };
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
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
  GainersLosersTimeFrame,
} from '../dtos/get-gainers-losers.dto';
import { GetCategoryDto } from '../dtos/get-category.dto';
import { JupiterService } from '../../../infra/jupiter/jupiter.service';
import { CoinGeckoService } from '../../../infra/coingecko/coingecko.service';
import { SolanaService } from '../../../infra/solana/solana.service';
import { TokenOverview, CategoryOverview } from '../dtos/discovery.response.dto';

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    @InjectRepository(Category)
    private readonly categoryRepository: Repository<Category>,
    private readonly jupiterService: JupiterService,
    private readonly coingeckoService: CoinGeckoService,
    private readonly solanaService: SolanaService,
  ) {}

  /**
   * Transform Category entity to CategoryOverview format
   */
  private transformToCategory(category: Category): CategoryOverview {
    return {
      name: category.name,
      slug: category.slug,
      description: category.description || '',
      market_cap: category.marketCap,
      change_1h: category.change1h,
      change_24h: category.change24h,
      change_7d: category.change7d,
      volume: category.volume,
      num_tokens: category.numTokens,
      top_tokens: [], // Will be populated separately if needed
    };
  }

  /**
   * Transform Token entity to TokenOverview format
   */
  private transformToTokenOverview(token: Token): TokenOverview {
    return {
      address: token.address,
      symbol: token.symbol,
      name: token.name,
      logo_uri: token.logoUri || '',
      network: 'solana',
      category: token.category?.name || '',
      age_seconds: token.ageSeconds,
      price: token.price,
      price_change_1h: token.priceChange1h,
      price_change_24h: token.priceChange24h,
      price_change_7d: token.priceChange7d,
      market_cap: token.marketCap,
      market_cap_change_24h: token.marketCapChange24h,
      fdv: token.fdv,
      liquidity: token.liquidity,
      liquidity_change_24h: token.liquidityChange24h,
      volume_24h: token.volume24h,
      volume_change_24h: token.volumeChange24h,
      txns_24h: {
        total: token.txns24hTotal,
        buys: token.txns24hBuys,
        sells: token.txns24hSells,
        change_24h: token.txns24hChange,
      },
      holders: {
        count: token.holdersCount,
        change_24h: token.holdersChange24h,
        unique_wallets_24h: token.uniqueWallets24h,
        top_10_percent: token.top10Percent,
        insider_percent: token.insiderPercent,
      },
      audit: {
        mint_authority_disabled: token.mintAuthorityDisabled,
        freeze_authority_disabled: token.freezeAuthorityDisabled,
        lp_burnt: token.lpBurnt,
        has_social_links: token.hasSocialLinks,
        holders_count: token.holdersCount,
        unique_wallets_24h: token.uniqueWallets24h,
        top_10_holders_percent: token.top10Percent,
        insider_percent: token.insiderPercent,
        risk_score: token.riskScore,
      },
      price_sparkline: token.priceSparkline || [],
    };
  }

  async getTrending(dto: GetTrendingDto) {
    const { sort_by, time_frame, limit, offset } = dto;

    // Sync real-time data from external APIs before querying
    await this.syncTrendingTokens();

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

    const transformedTokens = tokens.map(token => this.transformToTokenOverview(token));

    return {
      tokens: transformedTokens,
      total,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Sync trending tokens from CoinGecko (with optional Jupiter for Solana tokens)
   */
  private async syncTrendingTokens(): Promise<void> {
    try {
      // Get trending coins from CoinGecko
      const trendingData = await this.coingeckoService.getTrendingCoins();
      if (!trendingData || !trendingData.coins) {
        this.logger.warn('No trending data from CoinGecko');
        return;
      }

      this.logger.log(`Fetched ${trendingData.coins.length} trending coins from CoinGecko`);

      // Try to get Jupiter token list (optional - may fail if network issues)
      let solanaTokenMap = new Map<string, any>();
      try {
        const jupiterTokens = await this.jupiterService.getTokenList();
        if (jupiterTokens.length > 0) {
          solanaTokenMap = new Map(
            jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]),
          );
          this.logger.log(`Loaded ${jupiterTokens.length} tokens from Jupiter`);
        }
      } catch (error) {
        this.logger.warn('Jupiter API unavailable, proceeding without Solana matching');
      }

      // Get existing tokens from database
      const existingTokens = await this.tokenRepository.find();
      const existingTokenMap = new Map(existingTokens.map((t) => [t.symbol, t]));

      // Get market data from CoinGecko for top trending coins
      const coinIds = trendingData.coins.slice(0, 20).map((c) => c.item.id);
      const marketData = await this.coingeckoService.getCoinsMarketData(coinIds);
      const marketDataMap = new Map(marketData.map((m) => [m.id, m]));

      // Update or create tokens (only Solana tokens)
      let syncedCount = 0;
      for (const item of trendingData.coins.slice(0, 20)) {
        const symbol = item.item.symbol.toUpperCase();
        const market = marketDataMap.get(item.item.id);
        
        if (!market) continue;

        const jupiterToken = solanaTokenMap.get(item.item.symbol.toLowerCase());
        
        // Skip if not a Solana token
        if (!jupiterToken) {
          this.logger.debug(`Skipping ${symbol} - not found on Solana`);
          continue;
        }

        const existingToken = existingTokenMap.get(symbol);

        const tokenData = {
          symbol,
          name: item.item.name,
          address: jupiterToken.address,
          price: market.current_price || 0,
          priceChange1h: market.price_change_percentage_1h_in_currency || 0,
          priceChange24h: market.price_change_percentage_24h || 0,
          priceChange7d: market.price_change_percentage_7d_in_currency || 0,
          marketCap: market.market_cap || 0,
          marketCapChange24h: market.market_cap_change_percentage_24h || 0,
          volume24h: market.total_volume || 0,
          logoUri: item.item.large || market.image,
          coingeckoId: item.item.id,
          circulatingSupply: market.circulating_supply || 0,
          totalSupply: market.total_supply || 0,
          maxSupply: market.max_supply || 0,
          fdv: market.fully_diluted_valuation || 0,
        };

        if (existingToken) {
          await this.tokenRepository.update(existingToken.id, tokenData);
        } else {
          await this.tokenRepository.save(tokenData);
        }
        syncedCount++;
      }

      this.logger.log(`Synced ${syncedCount} trending tokens from CoinGecko`);
    } catch (error) {
      this.logger.error('Failed to sync trending tokens', error);
    }
  }

  async getNewListings(dto: GetNewListingsDto) {
    // Sync new listings from CoinGecko first
    await this.syncNewListings();

    const { time_frame, min_liquidity, limit, offset } = dto;

    let ageThresholdSeconds = 86400; // 24h default
    if (time_frame === TimeFrame.SEVEN_DAYS) {
      ageThresholdSeconds = 604800; // 7 days
    }

    const query = this.tokenRepository
      .createQueryBuilder('token')
      .leftJoinAndSelect('token.category', 'category')
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

    const transformedTokens = tokens.map(token => this.transformToTokenOverview(token));

    return {
      tokens: transformedTokens,
      total,
    };
  }

  /**
   * Sync new listings from CoinGecko
   */
  private async syncNewListings(): Promise<void> {
    try {
      this.logger.log('Starting new listings sync...');

      // Fetch recently added coins from CoinGecko
      const recentCoins = await this.coingeckoService.getRecentlyAddedCoins(50);

      if (!recentCoins || recentCoins.length === 0) {
        this.logger.warn('No recent coins found from CoinGecko');
        return;
      }

      // Get Jupiter token list to verify Solana tokens
      let solanaTokenMap = new Map<string, any>();
      try {
        const jupiterTokens = await this.jupiterService.getTokenList();
        if (jupiterTokens.length > 0) {
          solanaTokenMap = new Map(
            jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]),
          );
        }
      } catch (error) {
        this.logger.warn('Jupiter API unavailable for new listings sync');
        return; // Skip if can't verify Solana tokens
      }

      // Process and save tokens (only Solana)
      let syncedCount = 0;
      for (const coin of recentCoins) {
        const jupiterToken = solanaTokenMap.get(coin.symbol.toLowerCase());
        
        // Skip if not a Solana token
        if (!jupiterToken) {
          continue;
        }

        const tokenData = {
          address: jupiterToken.address,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          logoUri: coin.image,
          price: coin.current_price,
          priceChange1h: coin.price_change_percentage_1h_in_currency || 0,
          priceChange24h: coin.price_change_percentage_24h || 0,
          priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
          marketCap: coin.market_cap,
          marketCapChange24h: coin.market_cap_change_percentage_24h || 0,
          volume24h: coin.total_volume,
          circulatingSupply: coin.circulating_supply,
          totalSupply: coin.total_supply,
          maxSupply: coin.max_supply,
          coingeckoId: coin.id,
          // New listings are typically recent, so set a low age
          ageSeconds: 3600, // 1 hour default for new listings
          liquidity: coin.total_volume || 0, // Use volume as proxy for liquidity
        };

        await this.tokenRepository.upsert(tokenData, {
          conflictPaths: ['address'],
          skipUpdateIfNoValuesChanged: true,
        });
        syncedCount++;
      }

      this.logger.log(
        `Synced ${syncedCount} Solana new listings from CoinGecko`,
      );
    } catch (error) {
      this.logger.error('Failed to sync new listings', error);
    };
  }

  async getCategories() {
    const categories = await this.categoryRepository.find({
      order: { marketCap: 'DESC' },
    });

    const transformedCategories = categories.map(category => this.transformToCategory(category));

    return {
      categories: transformedCategories,
    };
  }

  /**
   * Sync categories from CoinGecko
   * Runs daily at 00:00
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async syncCategories(): Promise<void> {
    try {
      this.logger.log('Starting categories sync...');

      // Fetch categories from CoinGecko
      const categories = await this.coingeckoService.getCategories();

      if (!categories || categories.length === 0) {
        this.logger.warn('No categories found from CoinGecko');
        return;
      }

      // Process and save categories
      for (const cat of categories) {
        const categoryData = {
          slug: cat.id,
          name: cat.name,
          description: cat.content || '',
          marketCap: cat.market_cap,
          change24h: cat.market_cap_change_24h || 0,
          volume: cat.volume_24h,
          numTokens: 0,
        };

        await this.categoryRepository.upsert(categoryData, {
          conflictPaths: ['slug'],
          skipUpdateIfNoValuesChanged: true,
        });
      }

      this.logger.log(
        `Synced ${categories.length} categories from CoinGecko`,
      );
    } catch (error) {
      this.logger.error('Failed to sync categories', error);
    }
  }

  async getCategoryDetail(categorySlug: string, dto: GetCategoryDto) {
    const { sort_by, limit, offset } = dto;

    const category = await this.categoryRepository.findOne({
      where: { slug: categorySlug },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    // Sync tokens for this category
    await this.syncCategoryTokens(categorySlug, category.id);

    // Map snake_case to camelCase for Token entity fields
    const fieldMap: Record<string, string> = {
      market_cap: 'marketCap',
      volume_24h: 'volume24h',
      price_change_24h: 'priceChange24h',
      price_change_1h: 'priceChange1h',
      price_change_7d: 'priceChange7d',
    };

    let orderBy: { [key: string]: 'DESC' | 'ASC' } = { marketCap: 'DESC' };
    if (sort_by) {
      const mappedField = fieldMap[sort_by] || sort_by;
      orderBy = { [mappedField]: 'DESC' };
    }

    const [tokens, total] = await this.tokenRepository.findAndCount({
      where: { categoryId: category.id },
      order: orderBy,
      take: limit,
      skip: offset,
      relations: ['category'],
    });

    const transformedCategory = this.transformToCategory(category);
    const transformedTokens = tokens.map(token => this.transformToTokenOverview(token));

    return {
      category: transformedCategory,
      tokens: transformedTokens,
      total,
    };
  }

  /**
   * Sync tokens for a specific category from CoinGecko
   */
  private async syncCategoryTokens(
    categorySlug: string,
    categoryId: string,
  ): Promise<void> {
    try {
      this.logger.log(`Starting token sync for category: ${categorySlug}...`);

      // Fetch coins by category from CoinGecko
      const coins = await this.coingeckoService.getCoinsByCategory(categorySlug);

      if (!coins || coins.length === 0) {
        this.logger.warn(`No coins found for category ${categorySlug}`);
        return;
      }

      // Get Jupiter token list to verify Solana tokens
      let solanaTokenMap = new Map<string, any>();
      try {
        const jupiterTokens = await this.jupiterService.getTokenList();
        if (jupiterTokens.length > 0) {
          solanaTokenMap = new Map(
            jupiterTokens.map((t) => [t.symbol.toLowerCase(), t]),
          );
        }
      } catch (error) {
        this.logger.warn('Jupiter API unavailable for category sync');
      }

      // Process and save tokens (only Solana)
      let syncedCount = 0;
      for (const coin of coins) {
        const jupiterToken = solanaTokenMap.get(coin.symbol.toLowerCase());
        
        // Skip if not a Solana token
        if (!jupiterToken) {
          continue;
        }

        const tokenData = {
          address: jupiterToken.address,
          name: coin.name,
          symbol: coin.symbol.toUpperCase(),
          logoUri: coin.image,
          price: coin.current_price,
          priceChange1h: coin.price_change_percentage_1h_in_currency || 0,
          priceChange24h: coin.price_change_percentage_24h || 0,
          priceChange7d: coin.price_change_percentage_7d_in_currency || 0,
          marketCap: coin.market_cap,
          marketCapChange24h: coin.market_cap_change_percentage_24h || 0,
          volume24h: coin.total_volume,
          circulatingSupply: coin.circulating_supply,
          totalSupply: coin.total_supply,
          maxSupply: coin.max_supply,
          categoryId: categoryId,
          coingeckoId: coin.id,
        };

        await this.tokenRepository.upsert(tokenData, {
          conflictPaths: ['address'],
          skipUpdateIfNoValuesChanged: true,
        });
        syncedCount++;
      }

      this.logger.log(
        `Synced ${syncedCount} Solana tokens for category ${categorySlug}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync tokens for category ${categorySlug}`,
        error,
      );
    }
  }

  async getGainersLosers(dto: GetGainersLosersDto) {
    const { type, limit, time_frame } = dto;

    // Sync real-time data from external APIs before querying
    await this.syncTrendingTokens();

    // Determine which field to sort by based on time_frame
    let orderByField = 'priceChange24h'; // default
    if (time_frame === GainersLosersTimeFrame.ONE_HOUR) {
      orderByField = 'priceChange1h';
    } else if (time_frame === GainersLosersTimeFrame.SEVEN_DAYS) {
      orderByField = 'priceChange7d';
    }

    let gainers: Token[] = [];
    let losers: Token[] = [];

    if (type === GainersLosersType.GAINERS || type === GainersLosersType.BOTH) {
      gainers = await this.tokenRepository.find({
        where: {},
        order: { [orderByField]: 'DESC' },
        take: limit,
        relations: ['category'],
      });
    }

    if (type === GainersLosersType.LOSERS || type === GainersLosersType.BOTH) {
      losers = await this.tokenRepository.find({
        where: {},
        order: { [orderByField]: 'ASC' },
        take: limit,
        relations: ['category'],
      });
    }

    const transformedGainers = gainers.map(token => this.transformToTokenOverview(token));
    const transformedLosers = losers.map(token => this.transformToTokenOverview(token));

    return {
      gainers: transformedGainers,
      losers: transformedLosers,
      updated_at: new Date().toISOString(),
    };
  }
}

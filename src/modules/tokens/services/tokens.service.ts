import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsOrderValue, ILike, Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import {
  TokenResponseDto,
  TokenDetailsResponseDto,
  TokenResponseOnchainData,
  TokenResponseMetadata,
  TokenOverviewResponseDto,
} from '../dtos/token.response.dto';
import { SolanaService } from 'src/infra/solana/solana.service';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { ConfigService } from '@nestjs/config';
import {
  TokenFilterConditionDto,
  TokenFilterResponseDto,
} from '../dtos/token.filter.dto';

@Injectable()
export class TokensService {
  private connection: Connection;
  private network: string;
  private jupiterSearchTokenUrl: string;
  private coingeckoListUrl: string;
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
    private readonly solanaService: SolanaService,
  ) {
    this.connection = this.solanaService.getConnection();
    this.network = this.solanaService.getNetwork();

    const jupiterSearchTokenUrl = this.configService.get<string>(
      'solana.jupiterApi.searchToken',
    );
    if (!jupiterSearchTokenUrl) {
      throw new Error('Jupyter search token URL is required');
    }
    this.jupiterSearchTokenUrl = jupiterSearchTokenUrl;

    const coingeckoListUrl = this.configService.get<string>(
      'solana.coingeckoApi.searchTokenId',
    );
    if (!coingeckoListUrl) {
      throw new Error('Coingecko search token URL is required');
    }
    this.coingeckoListUrl = coingeckoListUrl;
  }

  async findOne(address: string): Promise<TokenResponseDto | null> {
    const token = await this.tokenRepository.findOneBy({ address });
    let metadata: any;
    if (!token) {
      metadata = await this.getMetadata(address);
      if (Object.keys(metadata).length == 0) {
        return null;
      }
      await this.updateToken(address, metadata);
    }
    const tokenMetadata = token ?? metadata;
    const onchainData = await this.getOnchainData([tokenMetadata.address]);
    const metadataResponse: TokenResponseMetadata = {
      address: tokenMetadata.address,
      symbol: tokenMetadata.symbol || null,
      name: tokenMetadata.name || null,
      logo_uri: tokenMetadata.logoUri || null,
      network: this.network,
      description: tokenMetadata.description || null,
      website: tokenMetadata.website || null,
      social_links: {
        twitter: tokenMetadata.twitter || null,
        telegram: tokenMetadata.telegram || null,
        discord: tokenMetadata.discord || null,
      },
      category: tokenMetadata.category || null,
    };

    const onchainDataResponse: TokenResponseOnchainData = onchainData[0];
    return { ...metadataResponse, ...onchainDataResponse };
  }

  async search(
    query: string,
    limit: number = 10,
  ): Promise<TokenDetailsResponseDto[]> {
    const tokens = await this.tokenRepository.find({
      where: [
        { name: ILike(`%${query}%`) },
        { symbol: ILike(`%${query}%`) },
        { address: ILike(`%${query}%`) },
      ],
      take: limit,
    });
    const onchainDataList: TokenResponseOnchainData[] =
      await this.getOnchainData(tokens.map((token) => token.address));
    const result: TokenDetailsResponseDto[] = [];
    for (const [index, token] of tokens.entries()) {
      const metadataResponse: TokenResponseMetadata = {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        logo_uri: token.logoUri || null,
        network: this.network,
        description: token.description || null,
        website: token.website || null,
        social_links: {
          twitter: token.socialLinks?.twitter || null,
          telegram: token.socialLinks?.telegram || null,
          discord: token.socialLinks?.discord || null,
        },
      };
      result.push({ ...metadataResponse, ...onchainDataList[index] });
    }
    return result;
  }

  async filter(
    filter: TokenFilterConditionDto,
    limit: number = 10,
    sort_by: string,
    sort_order?: 'asc' | 'desc',
    offset?: number,
  ): Promise<TokenFilterResponseDto> {
    const orderValue: FindOptionsOrderValue =
      sort_order?.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const SortByMap = {
      market_cap: 'marketCap',
      volume_24h: 'volume24h',
      txns_24h: 'txns24hTotal',
      holders: 'holdersCount',
      age: 'ageSeconds',
      price_change_24h: 'priceChange24h',
    } as const;
    const column = SortByMap[sort_by];
    const whereConditions: any = {};
    if (filter?.metrics) {
      const m = filter.metrics;
      
      if (m.age_min_minutes != null && m.age_max_minutes != null) {
        whereConditions.ageSeconds = Between(
          m.age_min_minutes,
          m.age_max_minutes,
        );
      }

      if (m.liquidity_min != null && m.liquidity_max != null) {
        whereConditions.liquidity = Between(m.liquidity_min, m.liquidity_max);
      }

      if (m.market_cap_min != null && m.market_cap_max != null) {
        whereConditions.marketCap = Between(
          m.market_cap_min,
          m.market_cap_max,
        );
      }

      if (m.volume_24h_min != null && m.volume_24h_max != null) {
        whereConditions.volume24h = Between(
          m.volume_24h_min,
          m.volume_24h_max,
        );
      }

      if (m.txns_24h_min != null && m.txns_24h_max != null) {
        whereConditions.txns24hTotal = Between(
          m.txns_24h_min,
          m.txns_24h_max,
        );
      }

      if (m.holders_min != null && m.holders_max != null) {
        whereConditions.holdersCount = Between(m.holders_min, m.holders_max);
      }

      if (m.price_change_24h_min != null && m.price_change_24h_max != null) {
        whereConditions.priceChange24h = Between(
          m.price_change_24h_min,
          m.price_change_24h_max,
        );
      }
    }
    if (filter?.holder_filters) {
      const h = filter.holder_filters;

      if (h.top_10_max_percent != null) {
        whereConditions.top10Percent = Between(0, h.top_10_max_percent);
      }

      if (h.insider_max_percent != null) {
        whereConditions.insiderPercent = Between(0, h.insider_max_percent);
      }
    }
    const tokens = await this.tokenRepository.find({
      take: limit,
      skip: offset,
      order: column
        ? {
            [column]: orderValue,
          }
        : undefined,
      where: [
        whereConditions,
        [
          { name: ILike(`%${filter.search_query}%`) },
          { symbol: ILike(`%${filter.search_query}%`) },
          { address: ILike(`%${filter.search_query}%`) },
        ],
      ],
    });
    const responseTokens: TokenOverviewResponseDto[] = tokens.map(
      (token: Token) => {
        return {
          address: token.address ?? null,
          symbol: token.symbol ?? null,
          name: token.name ?? null,
          logo_uri: token.logoUri ?? null,
          network: this.network ?? null,
          category: null,
          age_seconds: Math.floor(
            new Date(token?.createdAt || new Date()).getTime() / 1000,
          ),

          price: token?.price ?? null,
          price_change_1h: token?.priceChange1h ?? null,
          price_change_24h: token?.priceChange24h ?? null,
          price_change_7d: token?.priceChange7d ?? null,

          market_cap: token?.marketCap ?? null,
          market_cap_change_24h: token?.marketCapChange24h ?? null,

          fdv: token.fdv ?? null,
          liquidity: token.liquidity ?? null,
          liquidity_change_24h: token.liquidityChange24h ?? null,

          volume_24h: token.volume24h ?? null,
          volume_change_24h: token.volumeChange24h ?? null,

          txns_24h: {
            total: token.txns24hTotal ?? null,
            buys: token.txns24hBuys ?? null,
            sells: token.txns24hSells ?? null,
            change_24h: token.txns24hChange ?? null,
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
          },
          price_sparkline: [],
        };
      },
    );

    return {
      tokens: responseTokens,
      total: responseTokens.length,
      filter_applied: filter,
    };
  }

  async updateToken(address: string, data: Partial<Token>) {
    const token = await this.tokenRepository.upsert({ address, ...data }, [
      'address',
    ]);
    return token;
  }

  async getMetadata(address: string): Promise<Partial<Token>> {
    try {
      const jupUrl = this.jupiterSearchTokenUrl + address; // các thông tin cơ bản
      const [metadataList, coingeckoIdList] = await Promise.all([
        fetch(jupUrl).then((res) => res.json()),
        fetch(this.coingeckoListUrl).then((res) => res.json()),
      ]);
      if (!metadataList || !coingeckoIdList) return {};
      if (metadataList.length == 0 || coingeckoIdList.length == 0) return {};

      const metadataJson = metadataList[0];
      const coingeckoId = coingeckoIdList.find(
        (c: any) =>
          c.symbol.toLowerCase() == metadataJson.symbol.toLowerCase() &&
          c.name.toLowerCase() == metadataJson.name.toLowerCase(),
      )?.id;
      return {
        address: address,
        symbol: metadataJson.symbol,
        name: metadataJson.name,
        logoUri: metadataJson.icon,
        description: metadataJson.description, // không có
        website: metadataJson.website,
        socialLinks: {
          twitter: metadataJson.twitter,
          telegram: metadataJson.telegram,
          discord: metadataJson.discord, // không có
        },

        // decimals: metadataJson.decimals,
        // tags: metadataJson.tags,
        // coingeckoId: coingeckoId,
      };
    } catch (e) {
      console.log('error', e);
      return {};
    }
  }

  async getTop20Holders(mintAddresses: string[]): Promise<
    {
      mintAddress: string;
      holders: { address: string; amount: number }[];
    }[]
  > {
    const results = await Promise.all(
      mintAddresses.map(async (mintAddress) => {
        try {
          const largestAccounts = await this.connection.getTokenLargestAccounts(
            new PublicKey(mintAddress),
          );

          const holders =
            largestAccounts?.value?.map((acc) => ({
              address: acc.address.toBase58(),
              amount: acc.uiAmount ?? 0,
            })) ?? [];

          return { mintAddress, holders };
        } catch (error) {
          return { mintAddress, holders: [] };
        }
      }),
    );

    return results;
  }

  async getOnchainData(
    addresses: string[],
  ): Promise<TokenResponseOnchainData[]> {
    const result: TokenResponseOnchainData[] = [];
    const jupUrl = this.jupiterSearchTokenUrl + addresses.join(',');
    const [holders, tokensInfo] = await Promise.all([
      this.getTop20Holders(addresses),
      fetch(jupUrl).then((res) => res.json()),
    ]);
    if (!tokensInfo?.length) return result;
    const holdersTop10AmountList = holders.map((h) => ({
      mintAddress: h.mintAddress,
      holderCount: h.holders
        .slice(0, 10)
        .reduce((sum, holder) => sum + holder.amount, 0),
    }));
    const holdersTop20Amount = holders.map((h) => ({
      mintAddress: h.mintAddress,
      holderCount: h.holders
        .slice(0, 20)
        .reduce((sum, holder) => sum + holder.amount, 0),
    }));
    for (const [index, address] of addresses.entries()) {
      result.push({
        age_seconds: null,
        total_supply: tokensInfo[index]?.totalSupply,
        circulating_supply: tokensInfo[index]?.circSupply,
        max_supply: null,

        price: tokensInfo[index]?.usdPrice,
        price_change: {
          '1h': tokensInfo[index]?.stats1h?.priceChange,
          '24h': tokensInfo[index]?.stats24h?.priceChange,
          '7d': tokensInfo[index]?.stats7d?.priceChange,
          '30d': tokensInfo[index]?.stats30d?.priceChange,
        },

        market_cap: tokensInfo[index]?.mcap,
        market_cap_change_24h: tokensInfo[index]?.stats24h?.priceChange,

        fdv: tokensInfo[index]?.fdv,
        liquidity: tokensInfo[index]?.liquidity,
        liquidity_change_24h: tokensInfo[index]?.stats24h?.liquidityChange,

        volume: {
          '1h': tokensInfo[index]?.stats1h?.volumeChange ?? 0,
          '24h': tokensInfo[index]?.stats24h?.volumeChange ?? 0,
          '7d': tokensInfo[index]?.stats7d?.volumeChange ?? 0,
          '30d': tokensInfo[index]?.stats30d?.volumeChange ?? 0,
        },

        txns: {
          '1h': {
            total:
              tokensInfo[index]?.stats1h?.numBuys +
              tokensInfo[index]?.stats1h?.numSells,
            buys: tokensInfo[index]?.stats1h?.numBuys,
          },
          '24h': {
            total:
              tokensInfo[index]?.stats24h?.numBuys +
              tokensInfo[index]?.stats24h?.numSells,
            buys: tokensInfo[index]?.stats24h?.numBuys,
          },
          '7d': {
            total:
              tokensInfo[index]?.stats7d?.numBuys +
                tokensInfo[index]?.stats7d?.numSells || 0,
            buys: tokensInfo[index]?.stats7d?.numBuys || 0,
          },
        },
        txns_change_24h: 0,

        holders: {
          count: tokensInfo[index]?.holderCount,
          change_24h: tokensInfo[index]?.stats24h?.holderChange,
          unique_wallets_24h: null,
          top_10_percent:
            (holdersTop10AmountList[index]?.holderCount ??
              0 / tokensInfo[index]?.totalSupply) * 100,
          top_20_percent:
            (holdersTop20Amount[index]?.holderCount ??
              0 / tokensInfo[index]?.totalSupply) * 100,
          insider_percent: null,
        },

        audit: {
          mint_authority: {
            disabled: tokensInfo[index]?.audit?.mintAuthorityDisabled,
            address: '-',
          },
          freeze_authority: {
            disabled: tokensInfo[index]?.audit?.freezeAuthorityDisabled,
            address: '-',
          },
          lp_burnt_percent: null,
          is_verified: tokensInfo[index]?.isVerified,
          risk_factors: null,
          risk_score: null,
        },

        chart_data: [],
        pools: [],
      });
    }
    return result;
  }
}

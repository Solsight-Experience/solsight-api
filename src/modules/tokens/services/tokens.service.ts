import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, FindOptionsOrderValue, ILike, Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import {
  TokenResponseDto,
  TokenOverviewResponseDto,
  TokenResponseOnchainData,
  TokenResponseMetadata,
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
      logo_uri: tokenMetadata.logo_uri || null,
      description: tokenMetadata.description || null,
      website: tokenMetadata.website || null,
      social_links: {
        twitter: tokenMetadata.twitter || null,
        telegram: tokenMetadata.telegram || null,
        discord: tokenMetadata.discord || null,
      },
    };

    const onchainDataResponse: TokenResponseOnchainData = onchainData[0];
    return { ...metadataResponse, ...onchainDataResponse };
  }

  async search(
    query: string,
    limit: number = 10,
  ): Promise<TokenOverviewResponseDto[]> {
    const tokens = await this.tokenRepository.find({
      where: {
        name: ILike(`%${query}%`),
        symbol: ILike(`%${query}%`),
        address: ILike(`%${query}%`),
      },
      take: limit,
    });
    const onchainDataList: TokenResponseOnchainData[] =
      await this.getOnchainData(tokens.map((token) => token.address));
    const result: TokenOverviewResponseDto[] = [];
    for (const [index, token] of tokens.entries()) {
      const metadataResponse: TokenResponseMetadata = {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        logo_uri: token.logoUri,
        description: token.description,
        website: token.website,
        social_links: {
          twitter: token.socialLinks?.twitter,
          telegram: token.socialLinks?.telegram,
          discord: token.socialLinks?.discord,
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
      where: whereConditions,
    });
    const responseTokens: TokenResponseDto[] = tokens.map((token) => {
      return {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        logo_uri: token.logoUri,
        description: token.description,
        website: token.website,
        social_links: {
          twitter: token.socialLinks?.twitter,
          telegram: token.socialLinks?.telegram,
          discord: token.socialLinks?.discord,
        },
        age_seconds: Math.floor(
          new Date(token?.createdAt || new Date()).getTime() / 1000,
        ),
        total_supply: token?.totalSupply,
        circulating_supply: token?.circulatingSupply,

        price: token?.price,
        price_change: {
          '1h': token?.priceChange1h,
          '24h': token?.priceChange24h,
          '7d': token?.priceChange7d,
          '30d': null,
        },

        market_cap: token?.marketCap,
        market_cap_change_24h: token?.marketCapChange24h,

        fdv: token?.fdv,
        liquidity: token?.liquidity,
        liquidity_change_24h: token?.liquidityChange24h,

        volume: {
          '1h': null,
          '24h': token?.volume24h,
          '7d': null,
          '30d': null,
        },

        holders: {
          count: token?.holdersCount,
          change_24h: token?.holdersChange24h,
          top_10_percent: token?.top10Percent,
          top_20_percent: null,
        },

        audit: {
          mint_authority: {
            disabled: token?.mintAuthorityDisabled,
            address: null,
          },
          freeze_authority: {
            disabled: token?.freezeAuthorityDisabled,
            address: null,
          },
          is_verified: true,
          lp_burnt: token?.lpBurnt,
          risk_score: token?.riskScore,
        },
      };
    });

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
        age_seconds: Math.floor(
          new Date(tokensInfo[index]?.createdAt || new Date()).getTime() / 1000,
        ),
        total_supply: tokensInfo[index]?.totalSupply,
        circulating_supply: tokensInfo[index]?.circSupply,

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
          '1h': tokensInfo[index]?.stats1h?.volumeChange ?? null,
          '24h': tokensInfo[index]?.stats24h?.volumeChange,
          '7d': tokensInfo[index]?.stats7d?.volumeChange,
          '30d': tokensInfo[index]?.stats30d?.volumeChange,
        },

        holders: {
          count: tokensInfo[index]?.holderCount,
          change_24h: tokensInfo[index]?.stats24h?.holderChange,
          top_10_percent:
            (holdersTop10AmountList[index]?.holderCount ??
              0 / tokensInfo[index]?.totalSupply) * 100,
          top_20_percent:
            (holdersTop20Amount[index]?.holderCount ??
              0 / tokensInfo[index]?.totalSupply) * 100,
        },

        audit: {
          mint_authority: {
            disabled: tokensInfo[index]?.audit?.mintAuthorityDisabled,
          },
          freeze_authority: {
            disabled: tokensInfo[index]?.audit?.freezeAuthorityDisabled,
          },
          is_verified: tokensInfo[index]?.isVerified,
        },
      });
    }
    return result;
  }
}

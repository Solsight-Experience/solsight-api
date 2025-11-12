import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import {
  TokenResponseDto,
  TokenOverviewResponseDto,
  TokenResponseOnchainData,
  TokenResponseMetadata,
} from '../dtos/token.response.dto';
export { TokenFilterDto } from '../dtos/token.filter.dto';
import { SolanaService } from 'src/infra/solana/solana.service';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAccount, TOKEN_PROGRAM_ID, getMint } from '@solana/spl-token';
import { ConfigService } from '@nestjs/config';
import { TokenFilterDto } from '../dtos/token.filter.dto';

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
        logo_uri: token.logo_uri,
        description: token.description,
        website: token.website,
        social_links: {
          twitter: token.twitter,
          telegram: token.telegram,
          discord: token.discord,
        },
      };
      result.push({ ...metadataResponse, ...onchainDataList[index] });
    }
    return result;
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
        logo_uri: metadataJson.icon,
        description: metadataJson.description, // không có
        website: metadataJson.website,
        twitter: metadataJson.twitter,
        telegram: metadataJson.telegram,
        discord: metadataJson.discord, // không có
        decimals: metadataJson.decimals,
        tags: metadataJson.tags,
        coingeckoId: coingeckoId,
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
        market_cap_change_24h:
          tokensInfo[index]?.stats24h?.priceChange *
          tokensInfo[index]?.circSupply,

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

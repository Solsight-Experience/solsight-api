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
  ): Promise<TokenOverviewResponseDto[]> {
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
    const result: TokenOverviewResponseDto[] = [];
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
        }
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
          '1h': tokensInfo[index]?.stats1h?.volumeChange ?? null,
          '24h': tokensInfo[index]?.stats24h?.volumeChange,
          '7d': tokensInfo[index]?.stats7d?.volumeChange,
          '30d': tokensInfo[index]?.stats30d?.volumeChange,
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
        txns_change_24h: null,

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
            address: null,
          },
          freeze_authority: {
            disabled: tokensInfo[index]?.audit?.freezeAuthorityDisabled,
            address: null,
          },
          lp_burnt_percent: null,
          is_verified: tokensInfo[index]?.isVerified,
          risk_factors: null,
          risk_score: null,
        },

        chart_data: null,
        pools: [],
      });
    }
    return result;
  }
}

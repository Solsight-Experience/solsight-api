import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import { TokenListProvider, TokenInfo } from '@solana/spl-token-registry';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TokenSeederService implements OnModuleInit {
  private readonly logger = new Logger(TokenSeederService.name);
  private coingeckoListUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {
    const coingeckoListUrl = this.configService.get<string>(
      'solana.coingeckoApi.searchTokenId',
    );
    if (!coingeckoListUrl) {
      throw new Error('Coingecko search token URL is required');
    }
    this.coingeckoListUrl = coingeckoListUrl;
  }

  async onModuleInit() {
    await this.seedTokens();
  }

  async seedTokens() {
    const count = await this.tokenRepository.count();
    if (count > 0) {
      this.logger.log('Token data already exists. Skipping seed.');
      return;
    }

    this.logger.log('Seeding token data...');
    await this.updateTokens();
  }

  async updateTokens() {
    try {
      const tokenListProvider = new TokenListProvider();

      const [coingeckoId, tokens] = await Promise.all([
        fetch(this.coingeckoListUrl).then((res) => res.json()),
        tokenListProvider.resolve(),
      ]);
      const tokenList = tokens
        .filterByChainId(101)
        .getList()
        .map(
          (
            token: TokenInfo & {
              extensions?: TokenInfo['extensions'] & {
                telegram?: string | undefined;
              };
            },
          ) => ({
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            logoUri: token.logoURI,
            description: token.extensions?.description,
            website: token.extensions?.website,
            socialLinks: {
              twitter: token.extensions?.twitter,
              telegram: token.extensions?.telegram,
              discord: token.extensions?.discord,
            },
            totalSupply: 0,
            circulatingSupply: 0,
            maxSupply: 0,
            price: 0,
            priceChange1h: 0,
            priceChange24h: 0,
            priceChange7d: 0,
            marketCap: 0,
            marketCapChange24h: 0,
            fdv: 0,
            liquidity: 0,
            liquidityChange24h: 0,
            volume24h: 0,
            volumeChange24h: 0,
            txns24hTotal: 0,
            txns24hBuys: 0,
            txns24hSells: 0,
            txns24hChange: 0,
            holdersCount: 0,
            holdersChange24h: 0,
            uniqueWallets24h: 0,
            top10Percent: 0,
            insiderPercent: 0,
            mintAuthorityDisabled: false,
            freezeAuthorityDisabled: false,
            lpBurnt: false,
            hasSocialLinks: false,
            riskScore: 0,
            riskFactors: [],
            ageSeconds: 0,
            priceSparkline: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        );
      const BATCH_SIZE = 1000;
      for (let i = 0; i < tokenList.length; i += BATCH_SIZE) {
        const batch = tokenList.slice(i, i + BATCH_SIZE);
        await this.tokenRepository.upsert(batch, ['address']);
      }
      this.logger.log('Successfully seeded token data.');
    } catch (error) {
      this.logger.error('Failed to seed token data', error.stack);
    }
  }
}

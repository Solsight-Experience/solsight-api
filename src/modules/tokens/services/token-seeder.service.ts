import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import { TokenListProvider, TokenInfo } from '@solana/spl-token-registry';

@Injectable()
export class TokenSeederService implements OnModuleInit {
  private readonly logger = new Logger(TokenSeederService.name);

  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {}

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
    try {
      const tokenListProvider = new TokenListProvider();
      const tokens = await tokenListProvider.resolve();
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
            logo_uri: token.logoURI,
            description: token.extensions?.description,
            website: token.extensions?.website,
            twitter: token.extensions?.twitter,
            telegram: token.extensions?.telegram,
            discord: token.extensions?.discord,
            decimals: token.decimals,
            tags: token.tags,
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

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import { SEED_TOKENS } from '../data/seed-data';

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
      await this.tokenRepository.upsert(SEED_TOKENS, ['mintAddress']);
      this.logger.log('Successfully seeded token data.');
    } catch (error) {
      this.logger.error('Failed to seed token data', error.stack);
    }
  }
}

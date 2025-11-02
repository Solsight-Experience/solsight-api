import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../entities/token.entity';
import { TokenResponseDto } from '../dtos/token.response.dto';

@Injectable()
export class TokensService {
  constructor(
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {}

  async findAll(): Promise<TokenResponseDto[]> {
    const tokens = await this.tokenRepository.find();
    return tokens.map((token) => ({
      mintAddress: token.mintAddress,
      symbol: token.symbol,
      name: token.name,
      logoUrl: token.logoUrl,
      decimals: token.decimals,
      tags: token.tags,
      coingeckoId: token.coingeckoId,
    }));
  }
}

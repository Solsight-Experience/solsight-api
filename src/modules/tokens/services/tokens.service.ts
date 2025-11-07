import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    return tokens.map(
      (token): TokenResponseDto => ({
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
      }),
    );
  }

  async findOne(address: string): Promise<TokenResponseDto> {
    const token = await this.tokenRepository.findOneBy({ address });
    let metadata: any;
    if (!token) {
      metadata = await this.getOnchainMetadata(address);
      console.log(metadata);
      await this.updateToken(address, metadata);
      if (Object.keys(metadata).length == 0) {
        throw new NotFoundException(
          `Token with mint address ${address} not found`,
        );
      }
    }
    const tokenMetadata = token ?? metadata;
    return {
      address: tokenMetadata.address,
      symbol: tokenMetadata.symbol,
      name: tokenMetadata.name,
      logo_uri: tokenMetadata.logo_uri,
      description: tokenMetadata.description,
      website: tokenMetadata.website,
      social_links: {
        twitter: tokenMetadata.twitter,
        telegram: tokenMetadata.telegram,
        discord: tokenMetadata.discord,
      },
    };
  }

  async updateToken(address: string, data: Partial<Token>) {
    const token = await this.tokenRepository.upsert({ address, ...data }, [
      'address',
    ]);
    return token;
  }

  async getOnchainMetadata(address: string): Promise<Partial<Token>> {
    try {
      const uri = 'https://lite-api.jup.ag/tokens/v2/search?query=' + address;
      const response = await fetch(uri);
      const [metadataJson] = (await response.json()) ?? [];
      if (!metadataJson) return {};
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
      };
    } catch {
      return {};
    }
  }
}

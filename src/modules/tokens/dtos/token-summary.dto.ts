import { IsString, IsNotEmpty } from 'class-validator';

export class SummarizeTokenRequestDto {
  @IsString()
  @IsNotEmpty()
  address: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  symbol: string;
}

export class TokenSummaryResponseDto {
  address: string;
  summary: string;
  generatedAt: Date;
  model: string;
  cached: boolean;
  tokenData?: {
    name: string;
    symbol: string;
    price?: number;
    priceChange24h?: number;
  };
}

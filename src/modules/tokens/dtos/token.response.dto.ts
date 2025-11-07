export class TokenResponseDto {
  mintAddress: string;
  symbol: string;
  name: string;
  logoUrl?: string;
  decimals: number;
  tags?: string[];
  coingeckoId?: string;
}

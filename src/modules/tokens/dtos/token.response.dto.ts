export class TokenResponseDto {
  address: string;
  symbol: string;
  name: string;
  logo_uri?: string;
  description?: string;
  website?: string;
  social_links?: { twitter?: string; telegram?: string; discord?: string };
}

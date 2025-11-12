export type TokenResponseDto = TokenResponseMetadata & TokenResponseOnchainData;
export type TokenOverviewResponseDto = TokenResponseMetadata &
  TokenResponseOnchainData;

export type TokenResponseMetadata = {
  address: string;
  symbol: string;
  name: string;
  logo_uri?: string;
  description?: string;
  website?: string;
  social_links?: { twitter?: string; telegram?: string; discord?: string };
  category?: string[] | [];
};

export type TokenResponseOnchainData = {
  age_seconds?: number | null;

  total_supply?: number | null;
  circulating_supply?: number | null;

  price?: number | null;
  price_change?: {
    '1h': number | null;
    '24h': number | null;
    '7d': number | null;
    '30d': number | null;
  };

  market_cap?: number | null;
  market_cap_change_24h?: number | null;
  fdv?: number | null;
  liquidity?: number | null;
  liquidity_change_24h?: number | null;

  volume?: {
    '1h': number | null;
    '24h': number | null;
    '7d': number | null;
    '30d': number | null;
  };

  holders?: {
    count: number | null;
    change_24h: number | null;
    top_10_percent: number | null;
    top_20_percent: number | null;
  };

  audit?: {
    mint_authority: {
      disabled: boolean | null;
    };
    freeze_authority: {
      disabled: boolean | null;
    };
    is_verified: boolean | null;
  };
};

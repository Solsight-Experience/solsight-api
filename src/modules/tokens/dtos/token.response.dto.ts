export type TokenResponseDto = TokenResponseMetadata & TokenResponseOnchainData;
export type TokenDetailsResponseDto = TokenResponseMetadata &
  TokenResponseOnchainData;

export type TokenResponseMetadata = {
  address: string;
  symbol: string;
  name: string;
  logo_uri: string | null;
  network: string;
  description: string | null;
  website: string | null;
  social_links: {
    twitter: string | null;
    telegram: string | null;
    discord: string | null;
  };
  category?: string[] | [];
};

export type TokenChartDto = {
  interval: string;
  points: {
    timestamp: number;
    open: number;
    close: number;
    high: number;
    low: number;
    volume: number;
  }[];
};

export type TokenOverviewResponseDto = {
  address: string | null;
  symbol: string | null;
  name: string | null;
  logo_uri: string | null;
  network: string | null;
  category: string | null;
  age_seconds: number | null;
  price: number | null;
  price_change_1h: number | null;
  price_change_24h: number | null;
  price_change_7d: number | null;

  market_cap: number | null;
  market_cap_change_24h: number | null;
  fdv: number | null;
  liquidity: number | null;
  liquidity_change_24h: number | null;
  volume_24h: number | null;
  volume_change_24h: number | null;

  txns_24h: {
    total: number | null;
    buys: number | null;
    sells: number | null;
    change_24h: number | null;
  };

  holders: {
    count: number | null;
    change_24h: number | null;
    unique_wallets_24h: number | null;
    top_10_percent: number | null;
    insider_percent: number | null;
  };

  audit: {
    mint_authority_disabled: boolean | null;
    freeze_authority_disabled: boolean | null;
    lp_burnt: boolean | null;
    has_social_links: boolean | null;
  };
  price_sparkline: number[];
};

export type TokenResponseOnchainData = {
  age_seconds: number | null;

  total_supply: number | null;
  circulating_supply: number | null;
  max_supply: number | null;

  price: number | null;
  price_change: {
    '1h': number | null;
    '24h': number | null;
    '7d': number | null;
    '30d': number | null;
  };

  market_cap: number | null;
  market_cap_change_24h: number | null;
  fdv: number | null;
  liquidity: number | null;
  liquidity_change_24h: number | null;

  volume: {
    '1h': number | null;
    '24h': number | null;
    '7d': number | null;
    '30d': number | null;
  };

  txns: {
    '1h': {
      total: number | null;
      buys: number | null;
    };
    '24h': {
      total: number | null;
      buys: number | null;
    };
    '7d': {
      total: number | null;
      buys: number | null;
    };
  };

  txns_change_24h: number | null;

  holders: {
    count: number | null;
    change_24h: number | null;
    unique_wallets_24h: number | null;
    top_10_percent: number | null;
    top_20_percent: number | null;
    insider_percent: number | null;
  };

  audit: {
    mint_authority: {
      disabled: boolean | null;
      address: string | null;
    };
    freeze_authority: {
      disabled: boolean | null;
      address: string | null;
    };
    lp_burnt_percent: number | null;
    is_verified: boolean | null;
    risk_score: number | null;
    risk_factors: string | null;
  };

  chart_data: TokenChartDto | [];

  pools: {
    address: string;
    protocol: string;
    pair_token: {
      address: string;
      symbol: string;
    };
    liquidity: number;
    volume_24h: number;
    fee_percent: number;
  }[];
};

export type TokenFilterDto = {
  search_query?: string;
  metrics: {
    age_min_minutes: number;
    age_max_minutes: number;
    liquidity_min: number;
    liquidity_max: number;
    market_cap_min: number;
    market_cap_max: number;
    volume_24h_min: number;
    volume_24h_max: number;
    txns_24h_min: number;
    txns_24h_max: number;
    holders_min: number;
    holders_max: number;
    price_change_24h_min: number;
    price_change_24h_max: number;
  };
  audit_filters: {
    mint_authority_disabled: boolean;
    freeze_authority_disabled: boolean;
    has_social_links: boolean;
  };

  categories: string[];

  holder_filters: {
    top_10_max_percent: number;
  };
};

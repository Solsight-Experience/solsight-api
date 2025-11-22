import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum SortByTrending {
  VOLUME_24H = 'volume_24h',
  TXNS_24H = 'txns_24h',
  PRICE_CHANGE_24H = 'price_change_24h',
  MARKET_CAP = 'market_cap',
  HOLDERS_CHANGE = 'holders_change',
}

export enum TimeFrame {
  ONE_HOUR = '1h',
  TWENTY_FOUR_HOURS = '24h',
  SEVEN_DAYS = '7d',
}

export class GetTrendingDto {
  @IsOptional()
  @IsEnum(SortByTrending)
  sort_by?: SortByTrending = SortByTrending.VOLUME_24H;

  @IsOptional()
  @IsEnum(TimeFrame)
  time_frame?: TimeFrame = TimeFrame.TWENTY_FOUR_HOURS;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number = 0;
}

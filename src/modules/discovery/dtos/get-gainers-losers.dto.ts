import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export enum GainersLosersType {
  GAINERS = 'gainers',
  LOSERS = 'losers',
  BOTH = 'both',
}

export class GetGainersLosersDto {
  @IsOptional()
  @IsEnum(GainersLosersType)
  type?: GainersLosersType = GainersLosersType.BOTH;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}

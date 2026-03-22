import { IsString, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class ChartQueryDto {
  @IsString()
  interval: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;
}

export class ChartCandlePointDto {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class ChartResponseDto {
  interval: string;
  points: ChartCandlePointDto[];
}

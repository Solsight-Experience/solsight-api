import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export enum SortByTrending {
    VOLUME_24H = "volume_24h",
    TXNS_24H = "txns_24h",
    PRICE_CHANGE_24H = "price_change_24h",
    MARKET_CAP = "market_cap",
    HOLDERS_CHANGE = "holders_change"
}

export enum TimeFrame {
    FIVE_MINUTES = "5m",
    FIFTEEN_MINUTES = "15m",
    THIRTY_MINUTES = "30m",
    ONE_HOUR = "1h",
    SIX_HOURS = "6h",
    TWENTY_FOUR_HOURS = "24h",
    SEVEN_DAYS = "7d"
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

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    min_liquidity?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    max_liquidity?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    min_market_cap?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    max_market_cap?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    min_volume_24h?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    max_volume_24h?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    min_txns_24h?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    max_txns_24h?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    min_holders?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    max_holders?: number;
}

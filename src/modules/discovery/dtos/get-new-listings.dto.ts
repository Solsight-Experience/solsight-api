import { IsEnum, IsInt, IsNumber, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { TimeFrame } from "./get-trending.dto";

export class GetNewListingsDto {
    @IsOptional()
    @IsEnum(TimeFrame)
    time_frame?: TimeFrame = TimeFrame.TWENTY_FOUR_HOURS;

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

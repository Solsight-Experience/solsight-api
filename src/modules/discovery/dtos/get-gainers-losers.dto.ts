import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export enum GainersLosersType {
    GAINERS = "gainers",
    LOSERS = "losers",
    BOTH = "both"
}

export enum GainersLosersTimeFrame {
    ONE_HOUR = "1h",
    TWENTY_FOUR_HOURS = "24h",
    SEVEN_DAYS = "7d"
}

export class GetGainersLosersDto {
    @IsOptional()
    @IsEnum(GainersLosersTimeFrame)
    time_frame?: GainersLosersTimeFrame = GainersLosersTimeFrame.TWENTY_FOUR_HOURS;

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

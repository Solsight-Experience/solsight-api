import { IsDateString, IsInt, IsOptional, Max, Min } from "class-validator";
import { Type } from "class-transformer";

export class AnalyticsQueryDto {
    @IsOptional()
    @IsDateString()
    startDate?: string;

    @IsOptional()
    @IsDateString()
    endDate?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(10)
    limit?: number;
}

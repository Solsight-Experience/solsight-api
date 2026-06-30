import { IsString, IsOptional, IsNumber } from "class-validator";
import { Type } from "class-transformer";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class ChartQueryDto extends ClusterQueryDto {
    @IsString()
    interval: string;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    from?: number;

    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    to?: number;
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

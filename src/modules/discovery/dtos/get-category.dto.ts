import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class GetCategoryDto extends ClusterQueryDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsIn(["market_cap", "volume_24h", "name"])
    sort_by?: string = "market_cap";

    @IsOptional()
    @IsIn(["asc", "desc"])
    sort_order?: string = "desc";

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number = 10;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    offset?: number = 0;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    market_cap_min?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    market_cap_max?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    volume_min?: number;

    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    volume_max?: number;
}

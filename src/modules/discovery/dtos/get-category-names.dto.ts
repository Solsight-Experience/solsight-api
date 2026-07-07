import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { Type } from "class-transformer";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class GetCategoryNamesDto extends ClusterQueryDto {
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsIn(["asc", "desc"])
    sort_order?: string = "asc";

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(200)
    limit?: number = 20;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(0)
    offset?: number = 0;
}

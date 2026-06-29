import { IsOptional, IsNumber } from "class-validator";
import { Type } from "class-transformer";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class TradesQueryDto extends ClusterQueryDto {
    @IsOptional()
    @IsNumber()
    @Type(() => Number)
    limit?: number = 50;
}

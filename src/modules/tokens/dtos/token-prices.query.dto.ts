import { IsIn, IsOptional, IsString } from "class-validator";
import { Cluster, CLUSTERS } from "src/common/cluster/cluster.types";

export class TokenPricesQueryDto {
    @IsString()
    mints!: string;

    @IsOptional()
    @IsIn(CLUSTERS)
    network?: Cluster;
}

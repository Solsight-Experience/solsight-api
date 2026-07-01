import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class GetStakingHistoryDto extends ClusterQueryDto {
    @IsString()
    @IsSolanaAddress()
    wallet!: string;

    @IsOptional()
    @IsString()
    before?: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(50)
    pageSize?: number = 8;
}

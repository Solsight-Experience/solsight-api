import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";
import { DEFAULT_HISTORY_PAGE_SIZE, MAX_HISTORY_PAGE_SIZE } from "../types/staking.types";

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
    @Max(MAX_HISTORY_PAGE_SIZE)
    pageSize?: number = DEFAULT_HISTORY_PAGE_SIZE;
}

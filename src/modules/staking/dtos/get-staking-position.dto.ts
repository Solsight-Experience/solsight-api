import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";
import { DEFAULT_NATIVE_PAGE_SIZE, MAX_NATIVE_PAGE_SIZE } from "../types/staking.types";

export class GetStakingPositionDto extends ClusterQueryDto {
    @IsString()
    @IsSolanaAddress()
    wallet!: string;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number = 1;

    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    @Max(MAX_NATIVE_PAGE_SIZE)
    pageSize?: number = DEFAULT_NATIVE_PAGE_SIZE;
}

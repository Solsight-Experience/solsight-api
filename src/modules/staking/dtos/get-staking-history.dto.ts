import { Type } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";

export class GetStakingHistoryDto {
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
    @Max(50)
    pageSize?: number = 8;
}

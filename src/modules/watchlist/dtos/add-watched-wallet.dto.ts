import { IsString, IsOptional, IsIn, Length } from "class-validator";
import type { Cluster } from "../../../common/cluster/cluster.types";

export class AddWatchedWalletDto {
    @IsString()
    @Length(32, 44)
    walletAddress: string;

    @IsString()
    @IsOptional()
    label?: string;

    @IsString()
    @IsOptional()
    @IsIn(["mainnet", "devnet"])
    network?: Cluster;
}

export class UpdateWatchedWalletDto {
    @IsString()
    label: string;
}

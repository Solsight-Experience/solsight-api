import { IsEnum, IsBoolean, IsOptional, IsObject, IsIn, IsString } from "class-validator";
import { WalletAlertType, WalletAlertCondition } from "../entities/wallet-alert.entity";
import type { Cluster } from "../../../common/cluster/cluster.types";

export class CreateWalletAlertDto {
    @IsEnum(WalletAlertType)
    alertType!: WalletAlertType;

    @IsOptional()
    @IsObject()
    condition?: WalletAlertCondition;

    @IsOptional()
    @IsString()
    @IsIn(["mainnet", "devnet"])
    network?: Cluster;
}

export class UpdateWalletAlertDto {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsObject()
    condition?: WalletAlertCondition;
}

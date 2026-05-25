import { IsEnum, IsBoolean, IsOptional, IsObject } from "class-validator";
import { WalletAlertType, WalletAlertCondition } from "../entities/wallet-alert.entity";

export class CreateWalletAlertDto {
    @IsEnum(WalletAlertType)
    alertType: WalletAlertType;

    @IsOptional()
    @IsObject()
    condition?: WalletAlertCondition;
}

export class UpdateWalletAlertDto {
    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsObject()
    condition?: WalletAlertCondition;
}

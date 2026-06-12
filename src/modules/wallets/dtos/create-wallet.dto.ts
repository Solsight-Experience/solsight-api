import { IsString, IsOptional, IsEnum, IsBoolean } from "class-validator";
import { WalletIcon, WalletType } from "../entities/wallet.entity";

export class CreateWalletDto {
    @IsString()
    address: string;

    @IsOptional()
    @IsEnum(WalletType)
    type?: WalletType;

    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    publicKey?: string;

    @IsOptional()
    @IsString()
    derivationPath?: string;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsEnum(WalletIcon)
    icon?: WalletIcon;
}

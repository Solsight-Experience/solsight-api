import { IsString, IsOptional, IsEnum, IsBoolean } from "class-validator";
import { WalletType } from "../entities/wallet.entity";

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
    @IsString()
    icon?: string;
}

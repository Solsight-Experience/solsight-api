import { IsEnum, IsOptional, IsString } from "class-validator";
import { WalletIcon } from "../../wallets/entities/wallet.entity";

export class VerifySolanaDto {
    @IsString()
    walletAddress: string;

    @IsString()
    signature: string;

    @IsOptional()
    @IsString()
    nonce?: string;

    @IsOptional()
    @IsString()
    message?: string;

    @IsOptional()
    @IsString()
    userId?: string;

    @IsOptional()
    @IsEnum(WalletIcon)
    walletIcon?: WalletIcon;
}

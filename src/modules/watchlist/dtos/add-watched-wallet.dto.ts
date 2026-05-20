import { IsString, IsOptional, Length } from "class-validator";

export class AddWatchedWalletDto {
    @IsString()
    @Length(32, 44)
    walletAddress: string;

    @IsString()
    @IsOptional()
    label?: string;
}

export class UpdateWatchedWalletDto {
    @IsString()
    label: string;
}

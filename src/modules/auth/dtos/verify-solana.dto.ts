import { IsString, IsOptional, IsNotEmpty } from "class-validator";

export class VerifySolanaDto {
    @IsString()
    @IsNotEmpty()
    walletAddress: string;

    @IsString()
    @IsNotEmpty()
    signature: string;

    @IsString()
    @IsNotEmpty()
    message: string;

    @IsOptional()
    @IsString()
    walletIcon?: string;
}

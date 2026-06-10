import { IsBase64, IsNumber, IsOptional, IsString } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";

export class ExecuteSwapDto {
    @IsBase64()
    @IsString()
    signedTransaction: string;

    @IsOptional()
    @IsSolanaAddress()
    gaslessFeeToken?: string;

    @IsOptional()
    @IsString()
    walletAddress?: string;

    @IsOptional()
    @IsString()
    inputMint?: string;

    @IsOptional()
    @IsString()
    outputMint?: string;

    @IsOptional()
    @IsString()
    inAmount?: string;

    @IsOptional()
    @IsString()
    outAmount?: string;

    @IsOptional()
    @IsNumber()
    volumeUsd?: number;
}

import { IsNumber, IsOptional, IsString } from "class-validator";

export class ExecuteSwapDto {
    @IsString()
    signedTransaction: string;

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

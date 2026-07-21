import { IsBase64, IsIn, IsNumber, IsOptional, IsString } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ANTI_MEV_RPC_VALUES, type AntiMevRpc } from "../types/anti-mev.types";

export class ExecuteSwapDto {
    @IsBase64()
    @IsString()
    signedTransaction: string;

    @IsOptional()
    @IsSolanaAddress()
    gaslessFeeToken?: string;

    @IsOptional()
    @IsIn(ANTI_MEV_RPC_VALUES)
    antiMevRpc?: AntiMevRpc;

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

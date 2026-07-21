import { IsBoolean, IsEnum, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import type { QuoteResponse } from "../../../infra/executor/interfaces/executor-service.interface";
import type { JupiterRoutePlanStep, JupiterSwapMode } from "../../../infra/jupiter/types";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ANTI_MEV_RPC_VALUES, type AntiMevRpc } from "../types/anti-mev.types";

class QuoteResponseDto implements QuoteResponse {
    @IsString()
    @IsNotEmpty()
    inputMint: string;

    @IsString()
    @IsNotEmpty()
    inAmount: string;

    @IsString()
    @IsNotEmpty()
    outputMint: string;

    @IsString()
    @IsNotEmpty()
    outAmount: string;

    @IsString()
    @IsNotEmpty()
    otherAmountThreshold: string;

    @IsEnum(["ExactIn", "ExactOut"])
    swapMode: JupiterSwapMode;

    @IsNotEmpty()
    slippageBps: number;

    @IsString()
    @IsNotEmpty()
    priceImpactPct: string;

    @IsNotEmpty()
    routePlan: JupiterRoutePlanStep[];

    @IsNumber()
    @IsNotEmpty()
    contextSlot: number;

    @IsNumber()
    @IsNotEmpty()
    timeTaken: number;
}

export class GetSwapTransactionDto {
    @ValidateNested()
    @Type(() => QuoteResponseDto)
    quoteResponse: QuoteResponse;

    @IsSolanaAddress()
    userPublicKey: string;

    @IsBoolean()
    @IsOptional()
    wrapAndUnwrapSol?: boolean;

    @IsOptional()
    @IsSolanaAddress()
    gaslessFeeToken?: string;

    @IsOptional()
    @IsIn(ANTI_MEV_RPC_VALUES)
    antiMevRpc?: AntiMevRpc;
}

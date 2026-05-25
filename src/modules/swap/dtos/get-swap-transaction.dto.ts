import { IsBoolean, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import type { QuoteResponse } from "../../../infra/executor/interfaces/executor-service.interface";
import type { JupiterSwapMode } from "../../../infra/jupiter/types";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";

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
    routePlan: any[];
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
}

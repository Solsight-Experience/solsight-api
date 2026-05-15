import { IsIn, IsNumber, IsString } from "class-validator";
import { Type } from "class-transformer";

export class GetQuoteDto {
    @IsString()
    inputMint: string;

    @IsString()
    outputMint: string;

    @IsString()
    amount: string;

    @IsString()
    @IsIn(["ExactIn", "ExactOut"])
    swapMode: "ExactIn" | "ExactOut";

    @IsNumber()
    @Type(() => Number)
    slippageBps: number;
}

import { IsIn, IsNumber, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";

export class GetQuoteDto {
    @IsSolanaAddress()
    inputMint: string;

    @IsSolanaAddress()
    outputMint: string;

    @IsString()
    amount: string;

    @IsString()
    @IsIn(["ExactIn", "ExactOut"])
    swapMode: "ExactIn" | "ExactOut";

    @IsNumber()
    @Type(() => Number)
    @Min(0)
    slippageBps: number;
}

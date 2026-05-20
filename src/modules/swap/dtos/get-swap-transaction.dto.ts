import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";
import type { QuoteResponse } from "../interfaces/quote-response.interface";

export class GetSwapTransactionDto {
    @IsObject()
    quoteResponse: QuoteResponse;

    @IsString()
    userPublicKey: string;

    @IsBoolean()
    @IsOptional()
    wrapAndUnwrapSol?: boolean;
}

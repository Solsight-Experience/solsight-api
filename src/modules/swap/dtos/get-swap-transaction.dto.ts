import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";
import type { QuoteResponse } from "../../../infra/executor/interfaces/executor-service.interface";

export class GetSwapTransactionDto {
    @IsObject()
    quoteResponse: QuoteResponse;

    @IsString()
    userPublicKey: string;

    @IsBoolean()
    @IsOptional()
    wrapAndUnwrapSol?: boolean;
}

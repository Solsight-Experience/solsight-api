import { IsBoolean, IsObject, IsOptional, IsString } from "class-validator";

export class GetSwapTransactionDto {
    @IsObject()
    quoteResponse: Record<string, unknown>;

    @IsString()
    userPublicKey: string;

    @IsBoolean()
    @IsOptional()
    wrapAndUnwrapSol?: boolean;
}

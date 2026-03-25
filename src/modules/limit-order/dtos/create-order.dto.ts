import { IsString, IsNumber, IsOptional, Min, Max, ValidateNested, IsBoolean } from "class-validator";
import { Type } from "class-transformer";

/**
 * Order parameters nested object
 */
export class OrderParams {
    @IsString()
    makingAmount: string;

    @IsString()
    takingAmount: string;

    @IsString()
    @IsOptional()
    slippageBps?: string;

    @IsString()
    @IsOptional()
    expiredAt?: string;

    @IsString()
    @IsOptional()
    feeBps?: string;
}

/**
 * DTO for creating a Jupiter limit order
 */
export class CreateOrderDto {
    @IsString()
    inputMint: string;

    @IsString()
    outputMint: string;

    @IsString()
    maker: string;

    @IsString()
    payer: string;

    @ValidateNested()
    @Type(() => OrderParams)
    params: OrderParams;

    @IsString()
    @IsOptional()
    computeUnitPrice?: string;

    @IsString()
    @IsOptional()
    feeAccount?: string;

    @IsBoolean()
    @IsOptional()
    wrapAndUnwrapSol?: boolean;
}

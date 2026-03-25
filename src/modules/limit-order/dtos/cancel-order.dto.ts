import { IsString, IsArray, IsOptional } from "class-validator";

/**
 * DTO for canceling a single Jupiter limit order
 */
export class CancelOrderDto {
    @IsString()
    maker: string;

    @IsString()
    order: string;

    @IsString()
    @IsOptional()
    computeUnitPrice?: string;
}

/**
 * DTO for canceling multiple Jupiter limit orders
 */
export class CancelOrdersDto {
    @IsString()
    maker: string;

    @IsArray()
    @IsString({ each: true })
    @IsOptional()
    orders?: string[];

    @IsString()
    @IsOptional()
    computeUnitPrice?: string;
}

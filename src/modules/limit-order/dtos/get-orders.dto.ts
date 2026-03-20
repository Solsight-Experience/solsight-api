import { IsString, IsEnum, IsOptional, IsNumber, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum OrderStatus {
  ACTIVE = 'active',
  HISTORY = 'history',
}

/**
 * DTO for querying Jupiter limit orders
 */
export class GetOrdersDto {
  @IsString()
  user: string;

  @IsEnum(OrderStatus)
  orderStatus: OrderStatus;

  @IsString()
  @IsOptional()
  inputMint?: string;

  @IsString()
  @IsOptional()
  outputMint?: string;

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  page?: number;

  @Type(() => Boolean)
  @IsBoolean()
  @IsOptional()
  includeFailedTx?: boolean;
}

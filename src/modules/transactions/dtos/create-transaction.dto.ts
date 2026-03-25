import { IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString } from "class-validator";
import { TransactionType, TransactionStatus } from "../entities/transaction.entity";

export class CreateTransactionDto {
    @IsString()
    @IsNotEmpty()
    signature: string;

    @IsEnum(TransactionType)
    type: TransactionType;

    @IsEnum(TransactionStatus)
    @IsOptional()
    status?: TransactionStatus;

    @IsNumber()
    amount: number;

    @IsOptional()
    @IsString()
    fromWalletId?: string;

    @IsOptional()
    @IsString()
    toWalletId?: string;

    @IsOptional()
    @IsString()
    tokenMint?: string;

    @IsOptional()
    @IsNumber()
    fee?: number;

    @IsOptional()
    @IsString()
    blockNumber?: string;

    @IsOptional()
    blockTime?: Date;

    @IsOptional()
    @IsString()
    memo?: string;
}

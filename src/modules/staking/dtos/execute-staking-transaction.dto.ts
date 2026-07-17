import { IsBase64, IsString } from "class-validator";

export class ExecuteStakingTransactionDto {
    @IsBase64()
    @IsString()
    signedTransaction!: string;
}

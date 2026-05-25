import { IsString, IsBase64 } from "class-validator";

export class ExecuteSwapDto {
    @IsString()
    @IsBase64()
    signedTransaction: string;
}

import { IsString } from "class-validator";

export class ExecuteSwapDto {
    @IsString()
    signedTransaction: string;
}

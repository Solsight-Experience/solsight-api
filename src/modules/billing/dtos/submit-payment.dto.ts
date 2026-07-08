import { IsBase64, IsString } from "class-validator";

export class SubmitPaymentDto {
    @IsBase64()
    @IsString()
    signedTransaction: string;
}

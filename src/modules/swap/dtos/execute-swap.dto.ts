import { IsBase64, IsOptional, IsString } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";

export class ExecuteSwapDto {
    @IsString()
    @IsBase64()
    signedTransaction: string;

    @IsOptional()
    @IsSolanaAddress()
    gaslessFeeToken?: string;
}

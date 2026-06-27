import { IsIn, IsNumber, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class GetQuoteDto extends ClusterQueryDto {
    @IsSolanaAddress()
    inputMint: string;

    @IsSolanaAddress()
    outputMint: string;

    @IsString()
    amount: string;

    @IsString()
    @IsIn(["ExactIn", "ExactOut"])
    swapMode: "ExactIn" | "ExactOut";

    @IsNumber()
    @Type(() => Number)
    @Min(0)
    slippageBps: number;
}

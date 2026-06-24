import { IsIn, IsOptional, IsString, Matches } from "class-validator";

export type StakingTransactionAction = "stake" | "request-unstake" | "unstake" | "cancel-request";

export class BuildStakingTransactionDto {
    @IsIn(["stake", "request-unstake", "unstake", "cancel-request"])
    action!: StakingTransactionAction;

    @IsString()
    wallet!: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d+$/)
    amountLamports?: string;
}

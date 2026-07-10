import { IsIn, IsOptional, IsString, Matches } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { StakingMode } from "../types/staking.types";

export type StakingTransactionAction = "stake" | "unstake" | "withdraw";

export class BuildStakingTransactionDto {
    @IsIn(["liquid", "native"])
    mode!: StakingMode;

    @IsIn(["stake", "unstake", "withdraw"])
    action!: StakingTransactionAction;

    @IsString()
    @IsSolanaAddress()
    wallet!: string;

    @IsOptional()
    @IsString()
    @Matches(/^\d+$/)
    amountLamports?: string;

    /** Required for mode=native, action=stake — the approved validator to delegate to. */
    @IsOptional()
    @IsString()
    @IsSolanaAddress()
    voteAccount?: string;

    /** Required for mode=native, action=unstake|withdraw — the tracked native stake PDA. */
    @IsOptional()
    @IsString()
    @IsSolanaAddress()
    nativeStakeAddress?: string;
}

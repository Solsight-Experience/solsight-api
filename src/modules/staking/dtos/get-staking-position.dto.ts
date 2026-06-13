import { IsString } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";

export class GetStakingPositionDto {
    @IsString()
    @IsSolanaAddress()
    wallet!: string;
}

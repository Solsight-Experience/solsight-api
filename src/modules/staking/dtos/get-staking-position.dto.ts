import { IsString } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class GetStakingPositionDto extends ClusterQueryDto {
    @IsString()
    @IsSolanaAddress()
    wallet!: string;
}

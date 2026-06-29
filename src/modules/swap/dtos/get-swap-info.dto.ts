import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";

export class GetSwapInfoDto extends ClusterQueryDto {
    @IsSolanaAddress()
    inputMint!: string;

    @IsSolanaAddress()
    outputMint!: string;
}

export class SwapInfoResponse {
    autoPriorityFeeLamports!: number;
    autoTipLamports!: number;
    autoSlippageBps!: number | null;
    maxAutoFeeLamports!: number;
    gaslessEnabled!: boolean;
    gaslessSupportedTokens!: string[];
    payerPubkey!: string | null;
}

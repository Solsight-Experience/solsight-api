import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { ClusterQueryDto } from "../../../common/cluster/cluster-query.dto";
import { ExecutorCapability, type ExecutorKey } from "../../../infra/executor/interfaces/executor-capabilities.interface";

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
    executorKey!: ExecutorKey;
    capabilities!: ExecutorCapability[];
    gaslessEnabled!: boolean;
    gaslessSupportedTokens!: string[];
    payerPubkey!: string | null;
}

export interface CachedFeeFields {
    autoPriorityFeeLamports: number;
    autoTipLamports: number;
    maxAutoFeeLamports: number;
}

export interface CachedGaslessFields {
    gaslessEnabled: boolean;
    gaslessSupportedTokens: string[];
    payerPubkey: string | null;
}

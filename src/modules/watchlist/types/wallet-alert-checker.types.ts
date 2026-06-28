import { WalletAlert } from "../entities/wallet-alert.entity";
import type { Cluster } from "../../../common/cluster/cluster.types";

export interface SwapMints {
    mintIn?: string;
    mintOut?: string;
    amountIn?: number;
    amountOut?: number;
    dex?: string;
}

export type WalletAlertWithWallet = WalletAlert & {
    watchedWallet?: {
        label?: string | null;
        network?: Cluster;
    };
};

export interface NotificationMetadata {
    tokenIn?: string;
    tokenOut?: string;
    tokenInName?: string;
    tokenOutName?: string;
    tokenInLogo?: string;
    tokenOutLogo?: string;
    amountIn?: number;
    amountOut?: number;
    mintIn?: string;
    mintOut?: string;
    dex?: string;
    walletLabel?: string;
    walletTrackerUrl?: string;
    tokenSymbol?: string;
    tokenMint?: string;
    tokenLogo?: string;
    amountSol?: number;
    direction?: string;
    from?: string;
    to?: string;
}

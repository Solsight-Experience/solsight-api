import { WalletAlert } from "../entities/wallet-alert.entity";
import type { Cluster } from "../../../common/cluster/cluster.types";

export type WalletAlertWithWallet = WalletAlert & {
    watchedWallet?: {
        label?: string | null;
        network?: Cluster;
    };
};

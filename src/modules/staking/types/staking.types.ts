export const DEFAULT_HISTORY_PAGE_SIZE = 8;
export const MAX_HISTORY_PAGE_SIZE = 50;
export const SIGNATURE_BACKFILL_BATCH_SIZE = 50;
export const DEFAULT_NATIVE_PAGE_SIZE = 10;
export const MAX_NATIVE_PAGE_SIZE = 50;

export type StakingMode = "liquid" | "native";

export interface LiquidPositionResponse {
    poolTokenAmount: string;
    estimatedSol: number;
    poolTokenAccount: string;
}

export type NativeStakeStatus = "activating" | "active" | "deactivating" | "inactive";

export interface NativeStakeAccountResponse {
    address: string;
    voteAccount: string;
    lamports: string;
    estimatedSol: number;
    status: NativeStakeStatus;
}

export interface NativeStakePositionsPage {
    items: NativeStakeAccountResponse[];
    total: number;
    page: number;
    pageSize: number;
}

export interface StakingPositionResponse {
    liquid: LiquidPositionResponse | null;
    native: NativeStakePositionsPage;
}

export interface StakingValidatorResponse {
    voteAccount: string;
}

export type StakeActionType = "stake_liquid" | "unstake_liquid" | "stake_native" | "unstake_native" | "withdraw_native";
export type StakeRecordStatus = "pending" | "confirmed" | "failed";

export interface StakeHistoryRecord {
    id: string;
    stakeAccountAddress: string;
    createdAt: string;
    actionType: StakeActionType;
    status: StakeRecordStatus;
    amountSol: string;
    signature: string;
}

export interface StakingHistoryResponse {
    records: StakeHistoryRecord[];
    nextCursor: string | null;
}

export interface BuiltStakingTransaction {
    mode: StakingMode;
    action: import("../dtos/build-staking-transaction.dto").StakingTransactionAction;
    network: import("../../../common/cluster/cluster.types").Cluster;
    transaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
    nativeStakeAddress?: string;
}

export type CompiledMessageShape = {
    compiledInstructions: Array<{ programIdIndex: number; data: Uint8Array }>;
    staticAccountKeys: import("@solana/web3.js").PublicKey[];
};

export type TransactionMetaBalanceShape = {
    fee?: number;
    preBalances?: number[];
    postBalances?: number[];
};

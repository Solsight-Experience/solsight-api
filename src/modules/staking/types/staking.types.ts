export interface StakingFundSnapshot {
    authority: string;
    stakePool: string;
    stakePoolProgram: string;
    poolMint: string;
    withdrawAuthority: string;
    reserveStake: string;
    managerFeeAccount: string;
    vault: string;
    vaultTokenAccount: string;
    totalShares: string;
    unstakingPeriod: number;
    totalRevenue: string;
    ifPaused: boolean;
}

export interface StakingPositionResponse {
    ifShares: string;
    totalShares: string;
    vaultJitoTokenUnits: string;
    estimatedSol: number;
    lastWithdrawRequestShares: string;
    lastWithdrawRequestValue: number;
    lastWithdrawRequestTs: number;
    cooldownEndsAt: number;
    canWithdraw: boolean;
    unstakingPeriod: number;
    fund: StakingFundSnapshot;
}

export type StakeActionType = "stake" | "unstake" | "withdraw" | "cancel";
export type StakeRecordStatus = "pending" | "confirmed" | "failed" | "cooling_down" | "withdrawn";

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
    action: import("../dtos/build-staking-transaction.dto").StakingTransactionAction;
    network: import("../../../common/cluster/cluster.types").Cluster;
    transaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
}

export interface ResolvedPdas {
    insuranceFund: import("@solana/web3.js").PublicKey;
    vault: import("@solana/web3.js").PublicKey;
    ifStake: import("@solana/web3.js").PublicKey;
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

import { PublicKey } from "@solana/web3.js";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { DEVNET_POOL, MAINNET_POOL } from "./staking-addresses";

export interface StakePoolCoordinates {
    stakePoolProgram: PublicKey;
    stakePool: PublicKey;
    lstMint: PublicKey;
    withdrawAuthority: PublicKey;
    reserveStake: PublicKey;
    managerFeeAccount: PublicKey;
}

export function getStakePoolCoordinates(cluster: Cluster): StakePoolCoordinates {
    const pool = cluster === "mainnet" ? MAINNET_POOL : DEVNET_POOL;

    return {
        stakePoolProgram: new PublicKey(pool.stakePoolProgram),
        stakePool: new PublicKey(pool.stakePool),
        lstMint: new PublicKey(pool.lstMint),
        withdrawAuthority: new PublicKey(pool.withdrawAuthority),
        reserveStake: new PublicKey(pool.reserveStake),
        managerFeeAccount: new PublicKey(pool.managerFeeAccount)
    };
}

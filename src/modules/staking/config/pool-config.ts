import { BadRequestException } from "@nestjs/common";
import { PublicKey } from "@solana/web3.js";
import type { AppConfig } from "../../../config/configuration";
import type { Cluster } from "../../../common/cluster/cluster.types";

export interface StakePoolCoordinates {
    stakePoolProgram: PublicKey;
    stakePool: PublicKey;
    lstMint: PublicKey;
    withdrawAuthority: PublicKey;
    reserveStake: PublicKey;
    managerFeeAccount: PublicKey;
}

type PoolConfig = AppConfig["staking"]["mainnetPool"] | AppConfig["staking"]["devnetPool"];

export function getStakePoolCoordinates(cluster: Cluster, pool: PoolConfig): StakePoolCoordinates {
    const { stakePool, lstMint, withdrawAuthority, reserveStake, managerFeeAccount, stakePoolProgram } = pool;
    if (!stakePool || !lstMint || !withdrawAuthority || !reserveStake || !managerFeeAccount || !stakePoolProgram) {
        throw new BadRequestException(`Stake pool is not configured for ${cluster}.`);
    }

    return {
        stakePoolProgram: new PublicKey(stakePoolProgram),
        stakePool: new PublicKey(stakePool),
        lstMint: new PublicKey(lstMint),
        withdrawAuthority: new PublicKey(withdrawAuthority),
        reserveStake: new PublicKey(reserveStake),
        managerFeeAccount: new PublicKey(managerFeeAccount)
    };
}

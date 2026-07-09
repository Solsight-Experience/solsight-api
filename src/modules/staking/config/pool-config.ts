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

// Mainnet: Jito's SPL Stake Pool (mirrors staking-program/config/networks.ts).
const MAINNET_POOL: StakePoolCoordinates = {
    stakePoolProgram: new PublicKey("SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy"),
    stakePool: new PublicKey("Jito4APyf642JPZPx3hGc6WWJ8zPKtRbRs4P815Awbb"),
    lstMint: new PublicKey("J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn"),
    withdrawAuthority: new PublicKey("6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS"),
    reserveStake: new PublicKey("BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL"),
    managerFeeAccount: new PublicKey("8yoigZfzZ1nNaadumY9uPVD118225UYHTDpmjpr2nrSa")
};

export function getStakePoolCoordinates(cluster: Cluster, devnetPool: AppConfig["staking"]["devnetPool"]): StakePoolCoordinates {
    if (cluster === "mainnet") return MAINNET_POOL;

    const { stakePool, lstMint, withdrawAuthority, reserveStake, managerFeeAccount, stakePoolProgram } = devnetPool;
    if (!stakePool || !lstMint || !withdrawAuthority || !reserveStake || !managerFeeAccount || !stakePoolProgram) {
        throw new BadRequestException("Devnet stake pool is not configured. Set STAKING_DEVNET_* env vars (see staking-program/config/devnet-pool.json).");
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

import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { StakeActionType, StakingFundSnapshot } from "../types/staking.types";

const U32_FACTOR = BigInt(0x100000000);
const U64_FACTOR = BigInt(2) ** BigInt(64);
const ZERO = BigInt(0);

export interface InsuranceFundState {
    authority: PublicKey;
    stakePool: PublicKey;
    stakePoolProgram: PublicKey;
    poolMint: PublicKey;
    withdrawAuthority: PublicKey;
    reserveStake: PublicKey;
    managerFeeAccount: PublicKey;
    vault: PublicKey;
    vaultTokenAccount: PublicKey;
    totalShares: bigint;
    unstakingPeriod: number;
    totalRevenue: bigint;
    ifPaused: boolean;
}

export interface IFStakeAccountState {
    ifShares: bigint;
    lastWithdrawRequestShares: bigint;
    lastWithdrawRequestTs: number;
}

function pubkeyAt(data: Uint8Array, offset: number): PublicKey {
    return new PublicKey(new Uint8Array(data.buffer, data.byteOffset + offset, 32));
}

export function readU64LE(data: Uint8Array, offset: number): bigint {
    const view = new DataView(data.buffer, data.byteOffset);
    const lo = BigInt(view.getUint32(offset, true));
    const hi = BigInt(view.getUint32(offset + 4, true));
    return lo + hi * U32_FACTOR;
}

export function readU128LE(data: Uint8Array, offset: number): bigint {
    return readU64LE(data, offset) + readU64LE(data, offset + 8) * U64_FACTOR;
}

function readI64LE(data: Uint8Array, offset: number): bigint {
    const view = new DataView(data.buffer, data.byteOffset);
    const lo = BigInt(view.getUint32(offset, true));
    const hi = BigInt(view.getInt32(offset + 4, true));
    return lo | (BigInt(hi) << BigInt(32));
}

export function decodeInsuranceFund(data: Uint8Array): InsuranceFundState {
    let offset = 8;
    const authority = pubkeyAt(data, offset);
    offset += 32;
    const stakePool = pubkeyAt(data, offset);
    offset += 32;
    const stakePoolProgram = pubkeyAt(data, offset);
    offset += 32;
    const poolMint = pubkeyAt(data, offset);
    offset += 32;
    const withdrawAuthority = pubkeyAt(data, offset);
    offset += 32;
    const reserveStake = pubkeyAt(data, offset);
    offset += 32;
    const managerFeeAccount = pubkeyAt(data, offset);
    offset += 32;
    const vault = pubkeyAt(data, offset);
    offset += 32;
    const vaultTokenAccount = pubkeyAt(data, offset);
    offset += 32;
    const totalShares = readU128LE(data, offset);
    offset += 16;
    const unstakingPeriod = Number(readI64LE(data, offset));
    offset += 8;
    const totalRevenue = readU64LE(data, offset);
    offset += 8;
    const ifPaused = data[offset] === 1;

    return {
        authority,
        stakePool,
        stakePoolProgram,
        poolMint,
        withdrawAuthority,
        reserveStake,
        managerFeeAccount,
        vault,
        vaultTokenAccount,
        totalShares,
        unstakingPeriod,
        totalRevenue,
        ifPaused
    };
}

export function decodeIFStakeAccount(data: Uint8Array): IFStakeAccountState {
    const offset = 8 + 32;
    return {
        ifShares: readU128LE(data, offset),
        lastWithdrawRequestShares: readU128LE(data, offset + 16),
        lastWithdrawRequestTs: Number(readI64LE(data, offset + 32))
    };
}

export function serializeFund(fund: InsuranceFundState): StakingFundSnapshot {
    return {
        authority: fund.authority.toBase58(),
        stakePool: fund.stakePool.toBase58(),
        stakePoolProgram: fund.stakePoolProgram.toBase58(),
        poolMint: fund.poolMint.toBase58(),
        withdrawAuthority: fund.withdrawAuthority.toBase58(),
        reserveStake: fund.reserveStake.toBase58(),
        managerFeeAccount: fund.managerFeeAccount.toBase58(),
        vault: fund.vault.toBase58(),
        vaultTokenAccount: fund.vaultTokenAccount.toBase58(),
        totalShares: fund.totalShares.toString(),
        unstakingPeriod: fund.unstakingPeriod,
        totalRevenue: fund.totalRevenue.toString(),
        ifPaused: fund.ifPaused
    };
}

export function estimateShareValue(shares: bigint, totalShares: bigint, vaultUnits: bigint): number {
    if (shares === ZERO || totalShares === ZERO || vaultUnits === ZERO) {
        return 0;
    }
    return Number((shares * vaultUnits) / totalShares) / LAMPORTS_PER_SOL;
}

export function classifyStakeAction(logs: string[]): StakeActionType | null {
    for (const log of logs) {
        if (log.includes("Instruction: AddInsuranceFundStake")) return "stake";
        if (log.includes("Instruction: RequestRemoveInsuranceFundStake")) return "unstake";
        if (log.includes("Instruction: RemoveInsuranceFundStake")) return "withdraw";
        if (log.includes("Instruction: CancelRequestRemoveInsuranceFundStake")) return "cancel";
    }
    return null;
}

export function parseStakeAmountFromInstructionData(data: Uint8Array, actionType: StakeActionType): string {
    try {
        if (actionType === "stake" && data.length >= 16) {
            const lamports = readU64LE(data, 8);
            const sol = Number(lamports) / LAMPORTS_PER_SOL;
            return sol > 0 ? sol.toFixed(6) : "0";
        }
    } catch {
        return "0";
    }

    return "0";
}

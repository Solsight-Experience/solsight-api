import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { CompiledMessageShape, StakeActionType, StakingFundSnapshot, TransactionMetaBalanceShape } from "../types/staking.types";

const U32_FACTOR = BigInt(0x100000000);
const U64_FACTOR = BigInt(2) ** BigInt(64);
export const ZERO = BigInt(0);

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

export function parseStakeAmountFromInstructionData(data: Uint8Array, actionType: StakeActionType, totalShares?: bigint, vaultUnits?: bigint): string {
    try {
        if (actionType === "stake" && data.length >= 16) {
            const lamports = readU64LE(data, 8);
            const sol = Number(lamports) / LAMPORTS_PER_SOL;
            return sol > 0 ? sol.toFixed(6) : "0.000000";
        }

        if (actionType === "unstake" && data.length >= 24 && totalShares && vaultUnits && totalShares > ZERO && vaultUnits > ZERO) {
            const shares = readU128LE(data, 8);
            const sol = Number((shares * vaultUnits) / totalShares) / LAMPORTS_PER_SOL;
            return sol > 0 ? sol.toFixed(6) : "0.000000";
        }
    } catch {
        return "0.000000";
    }

    return "0.000000";
}

export function parseWalletBalanceDeltaSol(meta: TransactionMetaBalanceShape | null | undefined, message: CompiledMessageShape, owner: PublicKey): string {
    const ownerIndex = message.staticAccountKeys.findIndex((key) => key.equals(owner));
    if (ownerIndex < 0) return "0.000000";

    const preBalance = meta?.preBalances?.[ownerIndex];
    const postBalance = meta?.postBalances?.[ownerIndex];
    if (preBalance == null || postBalance == null) return "0.000000";

    const deltaLamports = BigInt(postBalance - preBalance + (meta?.fee ?? 0));
    if (deltaLamports <= ZERO) return "0.000000";

    return (Number(deltaLamports) / LAMPORTS_PER_SOL).toFixed(6);
}

export const encoder = new TextEncoder();
export const U64_MASK = (BigInt(1) << BigInt(64)) - BigInt(1);
export const DISC = {
    addInsuranceFundStake: new Uint8Array([251, 144, 115, 11, 222, 47, 62, 236]),
    requestRemoveInsuranceFundStake: new Uint8Array([142, 70, 204, 92, 73, 106, 180, 52]),
    cancelRequestRemoveInsuranceFundStake: new Uint8Array([97, 235, 78, 62, 212, 42, 241, 127]),
    removeInsuranceFundStake: new Uint8Array([128, 166, 142, 9, 254, 187, 143, 174])
} as const;

export function isCompiledMessageShape(value: unknown): value is CompiledMessageShape {
    if (typeof value !== "object" || value === null) return false;
    if (!("compiledInstructions" in value) || !("staticAccountKeys" in value)) return false;

    const compiledInstructions = value.compiledInstructions;
    const staticAccountKeys = value.staticAccountKeys;

    return Array.isArray(compiledInstructions) && Array.isArray(staticAccountKeys);
}

export function u64LE(value: bigint): Uint8Array {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, value, true);
    return new Uint8Array(buf);
}

export function u128LE(value: bigint): Uint8Array {
    const buf = new ArrayBuffer(16);
    const view = new DataView(buf);
    view.setBigUint64(0, value & U64_MASK, true);
    view.setBigUint64(8, value >> BigInt(64), true);
    return new Uint8Array(buf);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

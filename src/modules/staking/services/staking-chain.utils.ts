import { createHash } from "crypto";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { CompiledMessageShape, StakeActionType, TransactionMetaBalanceShape } from "../types/staking.types";

const U32_FACTOR = BigInt(0x100000000);
const U64_FACTOR = BigInt(2) ** BigInt(64);
export const ZERO = BigInt(0);

// ─── Anchor sighash discriminators ─────────────────────────────────────────────
// Matches staking-program/scripts/staking-client.js — the program's IDL is stale
// (still describes the retired Insurance Fund program), so instructions are
// hand-built using Anchor's sighash convention instead of an anchor.Program client.
function sighash(namespace: "global" | "account", name: string): Uint8Array {
    return new Uint8Array(createHash("sha256").update(`${namespace}:${name}`).digest().subarray(0, 8));
}

export const IX_DISC = {
    stake: sighash("global", "stake"),
    unstake: sighash("global", "unstake"),
    stakeNative: sighash("global", "stake_native"),
    unstakeNative: sighash("global", "unstake_native"),
    withdrawNative: sighash("global", "withdraw_native")
} as const;

export const ACCOUNT_DISC = {
    approvedValidator: sighash("account", "ApprovedValidator")
} as const;

// ─── PDAs ──────────────────────────────────────────────────────────────────────
export function findStakePoolConfigPda(programId: PublicKey, authority: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("stake_pool_config"), authority.toBuffer()], programId);
}

export function findApprovedValidatorPda(programId: PublicKey, stakePoolConfig: PublicKey, voteAccount: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("approved_validator"), stakePoolConfig.toBuffer(), voteAccount.toBuffer()], programId);
}

export function findNativeStakePda(programId: PublicKey, owner: PublicKey, voteAccount: PublicKey, seed: bigint): [PublicKey, number] {
    return PublicKey.findProgramAddressSync([Buffer.from("native_stake"), owner.toBuffer(), voteAccount.toBuffer(), u64LE(seed)], programId);
}

// ─── Byte helpers ───────────────────────────────────────────────────────────────
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

function pubkeyAt(data: Uint8Array, offset: number): PublicKey {
    return new PublicKey(new Uint8Array(data.buffer, data.byteOffset + offset, 32));
}

export function u64LE(value: bigint): Uint8Array {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, value, true);
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

export const encoder = new TextEncoder();

// ─── StakePoolConfig (this program's own account) ──────────────────────────────
export interface StakePoolConfigState {
    authority: PublicKey;
    stakePool: PublicKey;
    stakePoolProgram: PublicKey;
    poolMint: PublicKey;
    withdrawAuthority: PublicKey;
    reserveStake: PublicKey;
    managerFeeAccount: PublicKey;
    isPaused: boolean;
}

export function decodeStakePoolConfig(data: Uint8Array): StakePoolConfigState {
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
    const isPaused = data[offset] === 1;

    return { authority, stakePool, stakePoolProgram, poolMint, withdrawAuthority, reserveStake, managerFeeAccount, isPaused };
}

export function decodeApprovedValidator(data: Uint8Array): { voteAccount: PublicKey } {
    return { voteAccount: pubkeyAt(data, 8) };
}

// ─── SPL Stake Pool (external program's account) — used for the pool exchange rate
// and the WithdrawStake fallback, same layout the old Insurance Fund service relied on.
export interface StakePoolWithdrawState {
    validatorList: PublicKey;
    totalLamports: bigint;
    poolTokenSupply: bigint;
}

export interface ValidatorListEntryState {
    status: number;
    activeStakeLamports: bigint;
    voteAccountAddress: PublicKey;
}

const STAKE_POOL_VALIDATOR_LIST_OFFSET = 98;
const STAKE_POOL_TOTAL_LAMPORTS_OFFSET = 258;
const STAKE_POOL_POOL_TOKEN_SUPPLY_OFFSET = 266;
const VALIDATOR_LIST_LEN_OFFSET = 5;
const VALIDATOR_LIST_ENTRY_OFFSET = 9;
const VALIDATOR_LIST_ENTRY_SIZE = 73;
const VALIDATOR_ACTIVE_STAKE_OFFSET = 0;
const VALIDATOR_STATUS_OFFSET = 40;
const VALIDATOR_VOTE_OFFSET = 41;

export function decodeStakePoolWithdrawState(data: Uint8Array): StakePoolWithdrawState {
    return {
        validatorList: pubkeyAt(data, STAKE_POOL_VALIDATOR_LIST_OFFSET),
        totalLamports: readU64LE(data, STAKE_POOL_TOTAL_LAMPORTS_OFFSET),
        poolTokenSupply: readU64LE(data, STAKE_POOL_POOL_TOKEN_SUPPLY_OFFSET)
    };
}

export function decodeValidatorList(data: Uint8Array): ValidatorListEntryState[] {
    const count = new DataView(data.buffer, data.byteOffset).getUint32(VALIDATOR_LIST_LEN_OFFSET, true);
    const validators: ValidatorListEntryState[] = [];

    for (let index = 0; index < count; index += 1) {
        const offset = VALIDATOR_LIST_ENTRY_OFFSET + index * VALIDATOR_LIST_ENTRY_SIZE;
        validators.push({
            status: data[offset + VALIDATOR_STATUS_OFFSET],
            activeStakeLamports: readU64LE(data, offset + VALIDATOR_ACTIVE_STAKE_OFFSET),
            voteAccountAddress: pubkeyAt(data, offset + VALIDATOR_VOTE_OFFSET)
        });
    }

    return validators;
}

export function deriveValidatorStakeAddress(stakePoolProgram: PublicKey, stakePool: PublicKey, voteAccountAddress: PublicKey): PublicKey {
    return PublicKey.findProgramAddressSync([voteAccountAddress.toBuffer(), stakePool.toBuffer()], stakePoolProgram)[0];
}

export function poolTokensToLamports(poolTokens: bigint, totalLamports: bigint, poolTokenSupply: bigint): bigint {
    if (poolTokens === ZERO || poolTokenSupply === ZERO) return ZERO;
    return (poolTokens * totalLamports) / poolTokenSupply;
}

export function lamportsToPoolTokens(lamports: bigint, totalLamports: bigint, poolTokenSupply: bigint): bigint {
    if (lamports === ZERO || totalLamports === ZERO) return ZERO;
    return (lamports * poolTokenSupply) / totalLamports;
}

// ─── Native Stake Program account (StakeStateV2) ───────────────────────────────
// No decoder for this is exposed by @solana/web3.js; layout per the Stake Program:
// tag(u32) + meta(rent_exempt_reserve: u64, authorized: {staker: pk, withdrawer: pk},
// lockup: {unix_timestamp: i64, epoch: u64, custodian: pk}) + stake{delegation{voter_pubkey,
// stake: u64, activation_epoch: u64, deactivation_epoch: u64, warmup_cooldown_rate: f64},
// credits_observed: u64} for tag === 2 (Stake).
export type NativeStakeStatus = "activating" | "active" | "deactivating" | "inactive";

export interface NativeStakeAccountState {
    staker: PublicKey;
    withdrawer: PublicKey;
    voteAccount: PublicKey;
    stakeLamports: bigint;
    activationEpoch: bigint;
    deactivationEpoch: bigint;
}

const STAKE_META_STAKER_OFFSET = 4 + 8;
const STAKE_META_WITHDRAWER_OFFSET = STAKE_META_STAKER_OFFSET + 32;
const STAKE_META_SIZE = 8 + 32 + 32 + (8 + 8 + 32);
const STAKE_DELEGATION_OFFSET = 4 + STAKE_META_SIZE;
const MAX_U64 = (BigInt(1) << BigInt(64)) - BigInt(1);

export function decodeNativeStakeAccount(data: Uint8Array): NativeStakeAccountState | null {
    const view = new DataView(data.buffer, data.byteOffset);
    const tag = view.getUint32(0, true);
    if (tag !== 2) return null; // not a Stake-state account (Uninitialized/Initialized/RewardsPool)

    const staker = pubkeyAt(data, STAKE_META_STAKER_OFFSET);
    const withdrawer = pubkeyAt(data, STAKE_META_WITHDRAWER_OFFSET);
    const voteAccount = pubkeyAt(data, STAKE_DELEGATION_OFFSET);
    const stakeLamports = readU64LE(data, STAKE_DELEGATION_OFFSET + 32);
    const activationEpoch = readU64LE(data, STAKE_DELEGATION_OFFSET + 40);
    const deactivationEpoch = readU64LE(data, STAKE_DELEGATION_OFFSET + 48);

    return { staker, withdrawer, voteAccount, stakeLamports, activationEpoch, deactivationEpoch };
}

export function classifyNativeStakeStatus(state: NativeStakeAccountState, currentEpoch: bigint): NativeStakeStatus {
    if (state.deactivationEpoch !== MAX_U64) {
        return currentEpoch > state.deactivationEpoch ? "inactive" : "deactivating";
    }
    return currentEpoch > state.activationEpoch ? "active" : "activating";
}

// ─── Instruction builders (accounts/order/writability match scripts/staking-client.js) ──
export interface TxIx {
    programId: PublicKey;
    keys: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }>;
    data: Buffer;
}

export function buildStakeIx(params: {
    programId: PublicKey;
    owner: PublicKey;
    stakePoolConfig: PublicKey;
    userPoolTokenAccount: PublicKey;
    pool: import("../config/pool-config").StakePoolCoordinates;
    solAmountLamports: bigint;
    tokenProgramId: PublicKey;
    associatedTokenProgramId: PublicKey;
    systemProgramId: PublicKey;
}): TxIx {
    return {
        programId: params.programId,
        keys: [
            { pubkey: params.owner, isSigner: true, isWritable: true },
            { pubkey: params.stakePoolConfig, isSigner: false, isWritable: false },
            { pubkey: params.userPoolTokenAccount, isSigner: false, isWritable: true },
            { pubkey: params.pool.stakePool, isSigner: false, isWritable: true },
            { pubkey: params.pool.withdrawAuthority, isSigner: false, isWritable: false },
            { pubkey: params.pool.reserveStake, isSigner: false, isWritable: true },
            { pubkey: params.pool.managerFeeAccount, isSigner: false, isWritable: true },
            { pubkey: params.pool.lstMint, isSigner: false, isWritable: true },
            { pubkey: params.pool.stakePoolProgram, isSigner: false, isWritable: false },
            { pubkey: params.tokenProgramId, isSigner: false, isWritable: false },
            { pubkey: params.associatedTokenProgramId, isSigner: false, isWritable: false },
            { pubkey: params.systemProgramId, isSigner: false, isWritable: false }
        ],
        data: Buffer.concat([IX_DISC.stake, u64LE(params.solAmountLamports)])
    };
}

export function buildUnstakeIx(params: {
    programId: PublicKey;
    owner: PublicKey;
    stakePoolConfig: PublicKey;
    userPoolTokenAccount: PublicKey;
    pool: import("../config/pool-config").StakePoolCoordinates;
    poolTokensAmount: bigint;
    clockSysvar: PublicKey;
    stakeHistorySysvar: PublicKey;
    stakeProgramId: PublicKey;
    tokenProgramId: PublicKey;
    fallbackAccounts?: { validatorList: PublicKey; validatorStake: PublicKey; destinationStake: PublicKey };
}): TxIx {
    const keys = [
        { pubkey: params.owner, isSigner: true, isWritable: true },
        { pubkey: params.stakePoolConfig, isSigner: false, isWritable: false },
        { pubkey: params.userPoolTokenAccount, isSigner: false, isWritable: true },
        { pubkey: params.pool.stakePool, isSigner: false, isWritable: true },
        { pubkey: params.pool.withdrawAuthority, isSigner: false, isWritable: false },
        { pubkey: params.pool.reserveStake, isSigner: false, isWritable: true },
        { pubkey: params.pool.managerFeeAccount, isSigner: false, isWritable: true },
        { pubkey: params.pool.lstMint, isSigner: false, isWritable: true },
        { pubkey: params.clockSysvar, isSigner: false, isWritable: false },
        { pubkey: params.stakeHistorySysvar, isSigner: false, isWritable: false },
        { pubkey: params.stakeProgramId, isSigner: false, isWritable: false },
        { pubkey: params.pool.stakePoolProgram, isSigner: false, isWritable: false },
        { pubkey: params.tokenProgramId, isSigner: false, isWritable: false }
    ];
    if (params.fallbackAccounts) {
        keys.push(
            { pubkey: params.fallbackAccounts.validatorList, isSigner: false, isWritable: true },
            { pubkey: params.fallbackAccounts.validatorStake, isSigner: false, isWritable: true },
            { pubkey: params.fallbackAccounts.destinationStake, isSigner: false, isWritable: true }
        );
    }
    return { programId: params.programId, keys, data: Buffer.concat([IX_DISC.unstake, u64LE(params.poolTokensAmount)]) };
}

export function buildStakeNativeIx(params: {
    programId: PublicKey;
    owner: PublicKey;
    stakePoolConfig: PublicKey;
    approvedValidator: PublicKey;
    voteAccount: PublicKey;
    nativeStake: PublicKey;
    seed: bigint;
    solAmountLamports: bigint;
    clockSysvar: PublicKey;
    stakeHistorySysvar: PublicKey;
    stakeConfigId: PublicKey;
    stakeProgramId: PublicKey;
    rentSysvar: PublicKey;
    systemProgramId: PublicKey;
}): TxIx {
    return {
        programId: params.programId,
        keys: [
            { pubkey: params.owner, isSigner: true, isWritable: true },
            { pubkey: params.stakePoolConfig, isSigner: false, isWritable: false },
            { pubkey: params.approvedValidator, isSigner: false, isWritable: false },
            { pubkey: params.voteAccount, isSigner: false, isWritable: false },
            { pubkey: params.nativeStake, isSigner: false, isWritable: true },
            { pubkey: params.clockSysvar, isSigner: false, isWritable: false },
            { pubkey: params.stakeHistorySysvar, isSigner: false, isWritable: false },
            { pubkey: params.stakeConfigId, isSigner: false, isWritable: false },
            { pubkey: params.stakeProgramId, isSigner: false, isWritable: false },
            { pubkey: params.rentSysvar, isSigner: false, isWritable: false },
            { pubkey: params.systemProgramId, isSigner: false, isWritable: false }
        ],
        data: Buffer.concat([IX_DISC.stakeNative, u64LE(params.seed), u64LE(params.solAmountLamports)])
    };
}

export function buildUnstakeNativeIx(params: {
    programId: PublicKey;
    owner: PublicKey;
    nativeStake: PublicKey;
    clockSysvar: PublicKey;
    stakeProgramId: PublicKey;
}): TxIx {
    return {
        programId: params.programId,
        keys: [
            { pubkey: params.owner, isSigner: true, isWritable: false },
            { pubkey: params.nativeStake, isSigner: false, isWritable: true },
            { pubkey: params.clockSysvar, isSigner: false, isWritable: false },
            { pubkey: params.stakeProgramId, isSigner: false, isWritable: false }
        ],
        data: Buffer.from(IX_DISC.unstakeNative)
    };
}

export function buildWithdrawNativeIx(params: {
    programId: PublicKey;
    owner: PublicKey;
    nativeStake: PublicKey;
    amountLamports: bigint;
    clockSysvar: PublicKey;
    stakeHistorySysvar: PublicKey;
    stakeProgramId: PublicKey;
}): TxIx {
    return {
        programId: params.programId,
        keys: [
            { pubkey: params.owner, isSigner: true, isWritable: true },
            { pubkey: params.nativeStake, isSigner: false, isWritable: true },
            { pubkey: params.clockSysvar, isSigner: false, isWritable: false },
            { pubkey: params.stakeHistorySysvar, isSigner: false, isWritable: false },
            { pubkey: params.stakeProgramId, isSigner: false, isWritable: false }
        ],
        data: Buffer.concat([IX_DISC.withdrawNative, u64LE(params.amountLamports)])
    };
}

// ─── History classification ─────────────────────────────────────────────────────
export function classifyStakeAction(logs: string[]): StakeActionType | null {
    for (const log of logs) {
        if (log.includes("Instruction: Stake") && !log.includes("StakeNative")) return "stake_liquid";
        if (log.includes("Instruction: Unstake") && !log.includes("UnstakeNative")) return "unstake_liquid";
        if (log.includes("Instruction: StakeNative")) return "stake_native";
        if (log.includes("Instruction: UnstakeNative")) return "unstake_native";
        if (log.includes("Instruction: WithdrawNative")) return "withdraw_native";
    }
    return null;
}

export function parseStakeAmountFromInstructionData(data: Uint8Array, actionType: StakeActionType): string {
    try {
        if ((actionType === "stake_liquid" || actionType === "withdraw_native") && data.length >= 16) {
            const lamports = readU64LE(data, 8);
            const sol = Number(lamports) / LAMPORTS_PER_SOL;
            return sol > 0 ? sol.toFixed(6) : "0.000000";
        }
        if (actionType === "stake_native" && data.length >= 24) {
            const lamports = readU64LE(data, 16);
            const sol = Number(lamports) / LAMPORTS_PER_SOL;
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
    if (deltaLamports === ZERO) return "0.000000";

    return (Number(deltaLamports < ZERO ? -deltaLamports : deltaLamports) / LAMPORTS_PER_SOL).toFixed(6);
}

export function isCompiledMessageShape(value: unknown): value is CompiledMessageShape {
    if (typeof value !== "object" || value === null) return false;
    if (!("compiledInstructions" in value) || !("staticAccountKeys" in value)) return false;

    const compiledInstructions = value.compiledInstructions;
    const staticAccountKeys = value.staticAccountKeys;

    return Array.isArray(compiledInstructions) && Array.isArray(staticAccountKeys);
}

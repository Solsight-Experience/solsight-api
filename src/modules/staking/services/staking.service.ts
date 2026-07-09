import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import {
    LAMPORTS_PER_SOL,
    PublicKey,
    StakeProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_RENT_PUBKEY,
    SYSVAR_STAKE_HISTORY_PUBKEY,
    SystemProgram,
    TransactionMessage,
    VersionedTransaction
} from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import { Repository } from "typeorm";
import type { Cluster } from "../../../common/cluster/cluster.types";
import type { AppConfig } from "../../../config/configuration";
import { HeliusResolver } from "../../../infra/solana/helius.resolver";
import { HeliusService } from "../../../infra/solana/helius.service";
import { getStakePoolCoordinates, StakePoolCoordinates } from "../config/pool-config";
import { BuildStakingTransactionDto, StakingTransactionAction } from "../dtos/build-staking-transaction.dto";
import { GetStakingHistoryDto } from "../dtos/get-staking-history.dto";
import { GetStakingPositionDto } from "../dtos/get-staking-position.dto";
import { StakingHistoryEntity } from "../entities/staking-history.entity";
import { StakingHistorySyncStateEntity } from "../entities/staking-history-sync-state.entity";
import { StakingNativeAccountEntity } from "../entities/staking-native-account.entity";
import {
    BuiltStakingTransaction,
    DEFAULT_HISTORY_PAGE_SIZE,
    DEFAULT_NATIVE_PAGE_SIZE,
    NativeStakePositionsPage,
    SIGNATURE_BACKFILL_BATCH_SIZE,
    StakeActionType,
    StakeHistoryRecord,
    StakingHistoryResponse,
    StakingPositionResponse,
    StakingValidatorResponse
} from "../types/staking.types";
import {
    ACCOUNT_DISC,
    buildStakeIx,
    buildStakeNativeIx,
    buildUnstakeIx,
    buildUnstakeNativeIx,
    buildWithdrawNativeIx,
    classifyNativeStakeStatus,
    classifyStakeAction,
    decodeApprovedValidator,
    decodeNativeStakeAccount,
    decodeStakePoolWithdrawState,
    decodeValidatorList,
    deriveValidatorStakeAddress,
    findApprovedValidatorPda,
    findNativeStakePda,
    findStakePoolConfigPda,
    isCompiledMessageShape,
    lamportsToPoolTokens,
    parseStakeAmountFromInstructionData,
    parseWalletBalanceDeltaSol,
    poolTokensToLamports,
    readU64LE,
    TxIx,
    ZERO
} from "./staking-chain.utils";

const STAKE_CONFIG_ID = new PublicKey("StakeConfig11111111111111111111111111111111");
const TOKEN_ACCOUNT_AMOUNT_OFFSET = 64;
// Solana RPC's getMultipleAccounts hard-caps at 100 pubkeys per call.
const GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE = 100;

@Injectable()
export class StakingService {
    constructor(
        private readonly configService: ConfigService,
        private readonly heliusResolver: HeliusResolver,
        @InjectRepository(StakingHistoryEntity)
        private readonly stakingHistoryRepository: Repository<StakingHistoryEntity>,
        @InjectRepository(StakingHistorySyncStateEntity)
        private readonly stakingHistorySyncStateRepository: Repository<StakingHistorySyncStateEntity>,
        @InjectRepository(StakingNativeAccountEntity)
        private readonly nativeAccountRepository: Repository<StakingNativeAccountEntity>
    ) {}

    // ─── Position ────────────────────────────────────────────────────────────
    async getPosition(cluster: Cluster, dto: GetStakingPositionDto): Promise<StakingPositionResponse> {
        const network = this.getConfiguredNetwork();
        this.assertRequestCluster(cluster, network);
        const owner = this.parsePublicKey(dto.wallet, "wallet");
        const rpc = this.heliusResolver.forCluster(network);
        const pool = this.getPool(network);

        const userAta = getAssociatedTokenAddressSync(pool.lstMint, owner);
        const [ataInfo, stakePoolInfo] = await Promise.all([rpc.getAccountInfo(userAta, "confirmed"), rpc.getAccountInfo(pool.stakePool, "confirmed")]);

        let liquid: StakingPositionResponse["liquid"] = null;
        if (ataInfo && stakePoolInfo) {
            const poolTokenAmount = readU64LE(ataInfo.data, TOKEN_ACCOUNT_AMOUNT_OFFSET);
            if (poolTokenAmount > ZERO) {
                const { totalLamports, poolTokenSupply } = decodeStakePoolWithdrawState(stakePoolInfo.data);
                const estimatedLamports = poolTokensToLamports(poolTokenAmount, totalLamports, poolTokenSupply);
                liquid = {
                    poolTokenAmount: poolTokenAmount.toString(),
                    estimatedSol: Number(estimatedLamports) / LAMPORTS_PER_SOL,
                    poolTokenAccount: userAta.toBase58()
                };
            }
        }

        const native = await this.getNativePositions(network, rpc, owner, dto.page ?? 1, dto.pageSize ?? DEFAULT_NATIVE_PAGE_SIZE);
        return { liquid, native };
    }

    private async getNativePositions(
        network: Cluster,
        rpc: HeliusService,
        owner: PublicKey,
        page: number,
        pageSize: number
    ): Promise<NativeStakePositionsPage> {
        const [rows, total] = await this.nativeAccountRepository.findAndCount({
            where: { cluster: network, walletAddress: owner.toBase58() },
            order: { createdAt: "DESC" },
            take: pageSize,
            skip: (page - 1) * pageSize
        });
        if (rows.length === 0) return { items: [], total, page, pageSize };

        const addresses = rows.map((row) => new PublicKey(row.address));
        const [infos, epochInfo] = await Promise.all([this.getMultipleAccountsInfoChunked(rpc, addresses), rpc.getEpochInfo("confirmed")]);
        const currentEpoch = BigInt(epochInfo.epoch);

        const items: NativeStakePositionsPage["items"] = [];
        infos.forEach((info, index) => {
            if (!info) return;
            const state = decodeNativeStakeAccount(info.data);
            if (!state) return;
            items.push({
                address: addresses[index].toBase58(),
                voteAccount: state.voteAccount.toBase58(),
                lamports: state.stakeLamports.toString(),
                estimatedSol: Number(state.stakeLamports) / LAMPORTS_PER_SOL,
                status: classifyNativeStakeStatus(state, currentEpoch)
            });
        });
        return { items, total, page, pageSize };
    }

    // getMultipleAccounts is capped at 100 pubkeys/call by the RPC itself — chunk to stay under it.
    private async getMultipleAccountsInfoChunked(rpc: HeliusService, addresses: PublicKey[]) {
        const chunks: PublicKey[][] = [];
        for (let i = 0; i < addresses.length; i += GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE) {
            chunks.push(addresses.slice(i, i + GET_MULTIPLE_ACCOUNTS_CHUNK_SIZE));
        }
        const results = await Promise.all(chunks.map((chunk) => rpc.getMultipleAccountsInfo(chunk, "confirmed")));
        return results.flat();
    }

    // ─── Validators ──────────────────────────────────────────────────────────
    async getValidators(cluster: Cluster): Promise<StakingValidatorResponse[]> {
        const network = this.getConfiguredNetwork();
        this.assertRequestCluster(cluster, network);
        const rpc = this.heliusResolver.forCluster(network);
        const programId = this.getProgramId();

        const accounts = await rpc.getProgramAccounts(programId, {
            commitment: "confirmed",
            filters: [{ memcmp: { offset: 0, bytes: bs58.encode(ACCOUNT_DISC.approvedValidator) } }]
        });

        return accounts.map(({ account }) => ({ voteAccount: decodeApprovedValidator(account.data).voteAccount.toBase58() }));
    }

    // ─── History ─────────────────────────────────────────────────────────────
    async getHistory(cluster: Cluster, dto: GetStakingHistoryDto): Promise<StakingHistoryResponse> {
        const network = this.getConfiguredNetwork();
        this.assertRequestCluster(cluster, network);
        const owner = this.parsePublicKey(dto.wallet, "wallet");
        const pool = this.getPool(network);
        const programId = this.getProgramId();
        const pageSize = dto.pageSize ?? DEFAULT_HISTORY_PAGE_SIZE;
        const before = dto.before;

        const liquidAddress = getAssociatedTokenAddressSync(pool.lstMint, owner).toBase58();
        const nativeRows = await this.nativeAccountRepository.find({ where: { cluster: network, walletAddress: owner.toBase58() } });
        const trackedAddresses = [liquidAddress, ...nativeRows.map((row) => row.address)];

        await Promise.all(
            trackedAddresses.map(async (address) => {
                const syncState = await this.getOrCreateSyncState(network, dto.wallet, address);
                if (before) {
                    const existingCount = await this.stakingHistoryRepository.count({ where: { cluster: network, stakeAccountAddress: address } });
                    if (existingCount < pageSize && !syncState.hasReachedOldestHistory) {
                        await this.backfillOlderHistory({ network, owner, stakeAccountAddress: address, programId, syncState });
                    }
                } else {
                    await this.backfillLatestHistory({ network, owner, stakeAccountAddress: address, programId, syncState });
                }
            })
        );

        const records = await this.readHistoryPage(network, dto.wallet, before, pageSize + 1);
        const hasMore = records.length > pageSize;
        const pageRecords = hasMore ? records.slice(0, pageSize) : records;
        const nextCursor = hasMore && pageRecords.length > 0 ? pageRecords[pageRecords.length - 1].signature : null;

        return {
            records: pageRecords.map((record) => this.toStakeHistoryRecord(record)),
            nextCursor
        };
    }

    private async getOrCreateSyncState(cluster: Cluster, walletAddress: string, stakeAccountAddress: string): Promise<StakingHistorySyncStateEntity> {
        const existing = await this.stakingHistorySyncStateRepository.findOne({ where: { cluster, stakeAccountAddress } });
        if (existing) return existing;

        return this.stakingHistorySyncStateRepository.save(
            this.stakingHistorySyncStateRepository.create({
                cluster,
                walletAddress,
                stakeAccountAddress,
                newestSyncedSignature: null,
                oldestSyncedSignature: null,
                hasReachedOldestHistory: false,
                lastSyncedAt: null
            })
        );
    }

    private async readHistoryPage(cluster: Cluster, walletAddress: string, before: string | undefined, limit: number): Promise<StakingHistoryEntity[]> {
        const qb = this.stakingHistoryRepository
            .createQueryBuilder("history")
            .where("history.cluster = :cluster", { cluster })
            .andWhere("history.walletAddress = :walletAddress", { walletAddress });

        if (before) {
            const cursor = await this.stakingHistoryRepository.findOne({ where: { cluster, signature: before } });
            if (!cursor) return [];

            qb.andWhere('(history."blockTime" < :cursorBlockTime OR (history."blockTime" = :cursorBlockTime AND history."signature" < :cursorSignature))', {
                cursorBlockTime: cursor.blockTime,
                cursorSignature: cursor.signature
            });
        }

        return qb.orderBy('history."blockTime"', "DESC").addOrderBy('history."signature"', "DESC").take(limit).getMany();
    }

    private async backfillLatestHistory(params: {
        network: Cluster;
        owner: PublicKey;
        stakeAccountAddress: string;
        programId: PublicKey;
        syncState: StakingHistorySyncStateEntity;
    }): Promise<void> {
        const rpc = this.heliusResolver.forCluster(params.network);
        const signatures = await rpc.getSignaturesForAddress(new PublicKey(params.stakeAccountAddress), {
            limit: SIGNATURE_BACKFILL_BATCH_SIZE,
            until: params.syncState.newestSyncedSignature ?? undefined
        });
        if (signatures.length === 0) return;

        const records = await this.fetchHistoryRecordsFromSignatures({
            signatures,
            network: params.network,
            stakeAccountAddress: params.stakeAccountAddress,
            walletAddress: params.owner.toBase58(),
            programId: params.programId,
            owner: params.owner
        });
        await this.persistHistoryBatch(params.syncState, records, {
            newestSyncedSignature: signatures[0]?.signature ?? params.syncState.newestSyncedSignature,
            oldestSyncedSignature: params.syncState.oldestSyncedSignature ?? signatures[signatures.length - 1]?.signature ?? null,
            hasReachedOldestHistory: params.syncState.hasReachedOldestHistory
        });
    }

    private async backfillOlderHistory(params: {
        network: Cluster;
        owner: PublicKey;
        stakeAccountAddress: string;
        programId: PublicKey;
        syncState: StakingHistorySyncStateEntity;
    }): Promise<void> {
        const rpc = this.heliusResolver.forCluster(params.network);
        const signatures = await rpc.getSignaturesForAddress(new PublicKey(params.stakeAccountAddress), {
            limit: SIGNATURE_BACKFILL_BATCH_SIZE,
            before: params.syncState.oldestSyncedSignature ?? undefined
        });

        if (signatures.length === 0) {
            await this.stakingHistorySyncStateRepository.save({ ...params.syncState, hasReachedOldestHistory: true, lastSyncedAt: new Date() });
            return;
        }

        const records = await this.fetchHistoryRecordsFromSignatures({
            signatures,
            network: params.network,
            stakeAccountAddress: params.stakeAccountAddress,
            walletAddress: params.owner.toBase58(),
            programId: params.programId,
            owner: params.owner
        });
        await this.persistHistoryBatch(params.syncState, records, {
            newestSyncedSignature: params.syncState.newestSyncedSignature ?? signatures[0]?.signature ?? null,
            oldestSyncedSignature: signatures[signatures.length - 1]?.signature ?? params.syncState.oldestSyncedSignature,
            hasReachedOldestHistory: false
        });
    }

    private async fetchHistoryRecordsFromSignatures(params: {
        signatures: Array<{ signature: string; slot: number; blockTime?: number | null }>;
        network: Cluster;
        stakeAccountAddress: string;
        walletAddress: string;
        programId: PublicKey;
        owner: PublicKey;
    }): Promise<StakingHistoryEntity[]> {
        const rpc = this.heliusResolver.forCluster(params.network);
        const records = await Promise.all(
            params.signatures.map(async (sigInfo): Promise<StakingHistoryEntity | null> => {
                const tx = await rpc.getTransaction(sigInfo.signature, { maxSupportedTransactionVersion: 0, commitment: "confirmed" });
                if (!tx) return null;

                const actionType = classifyStakeAction(tx.meta?.logMessages ?? []);
                if (!actionType) return null;

                const amountSol = this.parseAmountFromTransaction(tx.transaction.message, tx.meta, params.programId, params.owner, actionType);
                const status: "confirmed" | "failed" = tx.meta?.err ? "failed" : "confirmed";

                return this.stakingHistoryRepository.create({
                    signature: sigInfo.signature,
                    cluster: params.network,
                    walletAddress: params.walletAddress,
                    stakeAccountAddress: params.stakeAccountAddress,
                    actionType,
                    status,
                    amountSol,
                    slot: String(sigInfo.slot),
                    blockTime: new Date((sigInfo.blockTime ?? 0) * 1000)
                });
            })
        );

        return records.filter((record): record is StakingHistoryEntity => record !== null);
    }

    private async persistHistoryBatch(
        syncState: StakingHistorySyncStateEntity,
        records: StakingHistoryEntity[],
        nextState: { newestSyncedSignature: string | null; oldestSyncedSignature: string | null; hasReachedOldestHistory: boolean }
    ): Promise<void> {
        if (records.length > 0) {
            await this.stakingHistoryRepository.upsert(records, ["signature"]);
        }

        await this.stakingHistorySyncStateRepository.save({
            ...syncState,
            newestSyncedSignature: nextState.newestSyncedSignature,
            oldestSyncedSignature: nextState.oldestSyncedSignature,
            hasReachedOldestHistory: nextState.hasReachedOldestHistory,
            lastSyncedAt: new Date()
        });
    }

    private toStakeHistoryRecord(record: StakingHistoryEntity): StakeHistoryRecord {
        return {
            id: record.signature,
            stakeAccountAddress: record.stakeAccountAddress,
            createdAt: record.blockTime.toISOString(),
            actionType: record.actionType,
            status: record.status,
            amountSol: record.amountSol,
            signature: record.signature
        };
    }

    private parseAmountFromTransaction(message: unknown, meta: unknown, programId: PublicKey, owner: PublicKey, actionType: StakeActionType): string {
        if (!isCompiledMessageShape(message)) return "0.000000";

        for (const ix of message.compiledInstructions) {
            const programKey = message.staticAccountKeys[ix.programIdIndex];
            if (!programKey || !programKey.equals(programId)) continue;

            if (actionType === "unstake_liquid" || actionType === "unstake_native") {
                return parseWalletBalanceDeltaSol(meta as { fee?: number; preBalances?: number[]; postBalances?: number[] } | null | undefined, message, owner);
            }
            return parseStakeAmountFromInstructionData(ix.data, actionType);
        }
        return "0.000000";
    }

    // ─── Build transaction ───────────────────────────────────────────────────
    async buildTransaction(cluster: Cluster, dto: BuildStakingTransactionDto): Promise<BuiltStakingTransaction> {
        const network = this.getConfiguredNetwork();
        this.assertRequestCluster(cluster, network);
        const owner = this.parsePublicKey(dto.wallet, "wallet");
        const rpc = this.heliusResolver.forCluster(network);
        const latestBlockhash = await rpc.getLatestBlockhash("confirmed");

        const { instructions, nativeStakeAddress } = await this.buildInstructions(network, rpc, owner, dto, latestBlockhash.blockhash);

        const message = new TransactionMessage({
            payerKey: owner,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: instructions.map((ix) => ({ programId: ix.programId, keys: ix.keys, data: ix.data }))
        }).compileToV0Message();
        const tx = new VersionedTransaction(message);

        return {
            mode: dto.mode,
            action: dto.action,
            network,
            transaction: Buffer.from(tx.serialize()).toString("base64"),
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
            nativeStakeAddress
        };
    }

    private async buildInstructions(
        network: Cluster,
        rpc: HeliusService,
        owner: PublicKey,
        dto: BuildStakingTransactionDto,
        recentBlockhash: string
    ): Promise<{ instructions: TxIx[]; nativeStakeAddress?: string }> {
        if (dto.mode === "liquid") {
            return this.buildLiquidInstructions(network, rpc, owner, dto, recentBlockhash);
        }
        const { instruction, nativeStakeAddress } = await this.buildNativeInstruction(network, rpc, owner, dto);
        return { instructions: [instruction], nativeStakeAddress };
    }

    private async buildLiquidInstructions(
        network: Cluster,
        rpc: HeliusService,
        owner: PublicKey,
        dto: BuildStakingTransactionDto,
        recentBlockhash: string
    ): Promise<{ instructions: TxIx[]; nativeStakeAddress?: string }> {
        const programId = this.getProgramId();
        const authority = this.getAuthority();
        const [stakePoolConfig] = findStakePoolConfigPda(programId, authority);
        const pool = this.getPool(network);
        const userPoolTokenAccount = getAssociatedTokenAddressSync(pool.lstMint, owner);

        if (dto.action === "stake") {
            const amountLamports = this.requirePositiveAmount(dto.amountLamports, "stake");
            return {
                instructions: [
                    buildStakeIx({
                        programId,
                        owner,
                        stakePoolConfig,
                        userPoolTokenAccount,
                        pool,
                        solAmountLamports: amountLamports,
                        tokenProgramId: TOKEN_PROGRAM_ID,
                        associatedTokenProgramId: ASSOCIATED_TOKEN_PROGRAM_ID,
                        systemProgramId: SystemProgram.programId
                    })
                ]
            };
        }

        if (dto.action === "unstake") {
            const amountLamports = this.requirePositiveAmount(dto.amountLamports, "unstake");
            const [stakePoolInfo, reserveInfo, rentExemptLamports] = await Promise.all([
                rpc.getAccountInfo(pool.stakePool, "confirmed"),
                rpc.getAccountInfo(pool.reserveStake, "confirmed"),
                rpc.getMinimumBalanceForRentExemption(StakeProgram.space)
            ]);
            if (!stakePoolInfo) throw new NotFoundException("Configured stake pool account was not found.");
            if (!reserveInfo) throw new NotFoundException("Configured reserve stake account was not found.");

            const withdrawState = decodeStakePoolWithdrawState(stakePoolInfo.data);
            const poolTokensAmount = lamportsToPoolTokens(amountLamports, withdrawState.totalLamports, withdrawState.poolTokenSupply);
            if (poolTokensAmount <= ZERO) throw new BadRequestException("Amount too small to unstake.");

            // WithdrawSol pulls directly from the reserve; if it can't cover this amount,
            // fall back to WithdrawStake (delegates a fresh native stake account to the
            // caller instead of paying out SOL immediately). The resulting account behaves
            // like any other native stake position, so it's tracked in the same table and
            // shows up in the Native tab once the tx confirms.
            const availableReserveLamports = BigInt(reserveInfo.lamports) - BigInt(rentExemptLamports);
            let fallbackAccounts: { validatorList: PublicKey; validatorStake: PublicKey; destinationStake: PublicKey } | undefined;
            let fallbackNativeStakeAddress: string | undefined;
            const extraInstructions: TxIx[] = [];

            if (amountLamports > availableReserveLamports && availableReserveLamports >= ZERO) {
                const validatorListInfo = await rpc.getAccountInfo(withdrawState.validatorList, "confirmed");
                if (!validatorListInfo) throw new NotFoundException("Stake pool validator list account was not found.");

                const fallbackValidator = this.selectFallbackValidator({
                    stakePoolProgram: pool.stakePoolProgram,
                    stakePool: pool.stakePool,
                    poolTokensToBurn: poolTokensAmount,
                    withdrawState,
                    validators: decodeValidatorList(validatorListInfo.data)
                });

                const destinationSeed = `unstk-${recentBlockhash.slice(0, 26)}`;
                const destinationStake = await PublicKey.createWithSeed(owner, destinationSeed, StakeProgram.programId);

                extraInstructions.push(
                    SystemProgram.createAccountWithSeed({
                        fromPubkey: owner,
                        basePubkey: owner,
                        seed: destinationSeed,
                        newAccountPubkey: destinationStake,
                        lamports: rentExemptLamports,
                        space: StakeProgram.space,
                        programId: StakeProgram.programId
                    })
                );
                fallbackAccounts = { validatorList: withdrawState.validatorList, validatorStake: fallbackValidator.validatorStake, destinationStake };
                fallbackNativeStakeAddress = destinationStake.toBase58();

                await this.nativeAccountRepository.save(
                    this.nativeAccountRepository.create({
                        cluster: network,
                        walletAddress: owner.toBase58(),
                        voteAccount: fallbackValidator.voteAccount.toBase58(),
                        seed: destinationSeed,
                        address: fallbackNativeStakeAddress
                    })
                );
            }

            const unstakeIx = buildUnstakeIx({
                programId,
                owner,
                stakePoolConfig,
                userPoolTokenAccount,
                pool,
                poolTokensAmount,
                clockSysvar: SYSVAR_CLOCK_PUBKEY,
                stakeHistorySysvar: SYSVAR_STAKE_HISTORY_PUBKEY,
                stakeProgramId: StakeProgram.programId,
                tokenProgramId: TOKEN_PROGRAM_ID,
                fallbackAccounts
            });

            return { instructions: [...extraInstructions, unstakeIx], nativeStakeAddress: fallbackNativeStakeAddress };
        }

        throw new BadRequestException(`Unsupported liquid action: ${dto.action}`);
    }

    private selectFallbackValidator(params: {
        stakePoolProgram: PublicKey;
        stakePool: PublicKey;
        poolTokensToBurn: bigint;
        withdrawState: { totalLamports: bigint; poolTokenSupply: bigint };
        validators: Array<{ status: number; activeStakeLamports: bigint; voteAccountAddress: PublicKey }>;
    }): { validatorStake: PublicKey; voteAccount: PublicKey } {
        const activeValidators = params.validators
            .filter((validator) => validator.status === 0 && validator.activeStakeLamports > ZERO)
            .sort((left, right) => {
                if (left.activeStakeLamports === right.activeStakeLamports) return 0;
                return left.activeStakeLamports > right.activeStakeLamports ? -1 : 1;
            });

        if (activeValidators.length === 0) {
            throw new BadRequestException("Stake pool has no active validator stake available for fallback withdrawals.");
        }

        const requiredLamports =
            params.withdrawState.poolTokenSupply > ZERO
                ? (params.poolTokensToBurn * params.withdrawState.totalLamports + params.withdrawState.poolTokenSupply - 1n) /
                  params.withdrawState.poolTokenSupply
                : params.poolTokensToBurn;

        const selected = activeValidators.find((validator) => validator.activeStakeLamports >= requiredLamports) ?? activeValidators[0];
        return {
            validatorStake: deriveValidatorStakeAddress(params.stakePoolProgram, params.stakePool, selected.voteAccountAddress),
            voteAccount: selected.voteAccountAddress
        };
    }

    private async buildNativeInstruction(
        network: Cluster,
        rpc: HeliusService,
        owner: PublicKey,
        dto: BuildStakingTransactionDto
    ): Promise<{ instruction: TxIx; nativeStakeAddress?: string }> {
        const programId = this.getProgramId();
        const authority = this.getAuthority();
        const [stakePoolConfig] = findStakePoolConfigPda(programId, authority);

        if (dto.action === "stake") {
            const amountLamports = this.requirePositiveAmount(dto.amountLamports, "stake");
            const voteAccount = this.parsePublicKey(dto.voteAccount, "voteAccount");
            const [approvedValidator] = findApprovedValidatorPda(programId, stakePoolConfig, voteAccount);
            const approvedInfo = await rpc.getAccountInfo(approvedValidator, "confirmed");
            if (!approvedInfo) throw new BadRequestException("Validator is not approved for native staking.");

            const seed = BigInt(Date.now()) * 1_000_000n + BigInt(Math.floor(Math.random() * 1_000_000));
            const [nativeStake] = findNativeStakePda(programId, owner, voteAccount, seed);

            const instruction = buildStakeNativeIx({
                programId,
                owner,
                stakePoolConfig,
                approvedValidator,
                voteAccount,
                nativeStake,
                seed,
                solAmountLamports: amountLamports,
                clockSysvar: SYSVAR_CLOCK_PUBKEY,
                stakeHistorySysvar: SYSVAR_STAKE_HISTORY_PUBKEY,
                stakeConfigId: STAKE_CONFIG_ID,
                stakeProgramId: StakeProgram.programId,
                rentSysvar: SYSVAR_RENT_PUBKEY,
                systemProgramId: SystemProgram.programId
            });

            await this.nativeAccountRepository.save(
                this.nativeAccountRepository.create({
                    cluster: network,
                    walletAddress: owner.toBase58(),
                    voteAccount: voteAccount.toBase58(),
                    seed: seed.toString(),
                    address: nativeStake.toBase58()
                })
            );

            return { instruction, nativeStakeAddress: nativeStake.toBase58() };
        }

        const nativeStake = await this.requireOwnedNativeStake(network, owner, dto.nativeStakeAddress);

        if (dto.action === "unstake") {
            return {
                instruction: buildUnstakeNativeIx({ programId, owner, nativeStake, clockSysvar: SYSVAR_CLOCK_PUBKEY, stakeProgramId: StakeProgram.programId })
            };
        }

        if (dto.action === "withdraw") {
            const amountLamports = this.requirePositiveAmount(dto.amountLamports, "withdraw");
            const info = await rpc.getAccountInfo(nativeStake, "confirmed");
            if (!info) throw new NotFoundException("Native stake account was not found.");
            const state = decodeNativeStakeAccount(info.data);
            if (!state) throw new BadRequestException("Native stake account is not in a withdrawable state.");
            const epochInfo = await rpc.getEpochInfo("confirmed");
            const status = classifyNativeStakeStatus(state, BigInt(epochInfo.epoch));
            if (status !== "inactive") throw new BadRequestException("Stake has not finished deactivating yet.");

            return {
                instruction: buildWithdrawNativeIx({
                    programId,
                    owner,
                    nativeStake,
                    amountLamports,
                    clockSysvar: SYSVAR_CLOCK_PUBKEY,
                    stakeHistorySysvar: SYSVAR_STAKE_HISTORY_PUBKEY,
                    stakeProgramId: StakeProgram.programId
                })
            };
        }

        throw new BadRequestException(`Unsupported native action: ${String(dto.action)}`);
    }

    private async requireOwnedNativeStake(network: Cluster, owner: PublicKey, address: string | undefined): Promise<PublicKey> {
        if (!address) throw new BadRequestException("nativeStakeAddress is required.");
        const row = await this.nativeAccountRepository.findOne({ where: { cluster: network, address, walletAddress: owner.toBase58() } });
        if (!row) throw new NotFoundException("Native stake account was not found for this wallet.");
        return new PublicKey(row.address);
    }

    // ─── Config helpers ──────────────────────────────────────────────────────
    private getPool(network: Cluster): StakePoolCoordinates {
        const devnetPool = this.configService.get<AppConfig["staking"]["devnetPool"]>("staking.devnetPool")!;
        return getStakePoolCoordinates(network, devnetPool);
    }

    private getProgramId(): PublicKey {
        return this.getRequiredPublicKey("staking.programId", "STAKING_PROGRAM_ID");
    }

    private getAuthority(): PublicKey {
        return this.getRequiredPublicKey("staking.authority", "STAKING_AUTHORITY");
    }

    private requirePositiveAmount(amountLamportsStr: string | undefined, action: StakingTransactionAction): bigint {
        if (amountLamportsStr == null) throw new BadRequestException(`amountLamports is required for ${action}.`);
        const amountLamports = BigInt(amountLamportsStr);
        if (amountLamports <= ZERO) throw new BadRequestException(`amountLamports is required for ${action}.`);
        return amountLamports;
    }

    private getConfiguredNetwork(): Cluster {
        const network = this.configService.get<string>("solana.network");
        if (network === "devnet" || network === "mainnet") return network;
        if (network === "mainnet-beta") return "mainnet";
        throw new BadRequestException("Invalid SOLANA_NETWORK for staking. Use devnet or mainnet.");
    }

    private assertRequestCluster(cluster: Cluster, network: Cluster) {
        if (cluster !== network) {
            throw new BadRequestException(`Staking is configured for ${network}, but request cluster is ${cluster}.`);
        }
    }

    private getRequiredPublicKey(configKey: string, envName: string): PublicKey {
        const value = this.configService.get<string>(configKey);
        if (!value) throw new BadRequestException(`${envName} is required to build staking transactions.`);
        return this.parsePublicKey(value, envName);
    }

    private parsePublicKey(value: string | undefined, label: string): PublicKey {
        if (!value) throw new BadRequestException(`${label} is required.`);
        try {
            return new PublicKey(value);
        } catch {
            throw new BadRequestException(`Invalid ${label} public key.`);
        }
    }
}

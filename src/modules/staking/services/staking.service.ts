import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
    PublicKey,
    StakeProgram,
    SYSVAR_CLOCK_PUBKEY,
    SYSVAR_STAKE_HISTORY_PUBKEY,
    SystemProgram,
    TransactionInstruction,
    TransactionMessage,
    VersionedTransaction,
    type AccountMeta
} from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { ClusterProvider } from "../../../common/cluster/cluster.provider";
import { Cluster } from "../../../common/cluster/cluster.types";
import { HeliusResolver } from "../../../infra/solana/helius.resolver";
import { BuildStakingTransactionDto, StakingTransactionAction } from "../dtos/build-staking-transaction.dto";
import { GetStakingHistoryDto } from "../dtos/get-staking-history.dto";
import { GetStakingPositionDto } from "../dtos/get-staking-position.dto";
import {
    StakeActionType,
    StakeHistoryRecord,
    BuiltStakingTransaction,
    CompiledMessageShape,
    ResolvedPdas,
    StakingHistoryResponse,
    StakingPositionResponse,
    StakeRecordStatus
} from "../types/staking.types";
import {
    classifyStakeAction,
    decodeIFStakeAccount,
    decodeInsuranceFund,
    estimateShareValue,
    InsuranceFundState,
    parseStakeAmountFromInstructionData,
    readU128LE,
    serializeFund
} from "./staking-chain.utils";

const encoder = new TextEncoder();
const U64_MASK = (BigInt(1) << BigInt(64)) - BigInt(1);
const ZERO = BigInt(0);

const DISC = {
    addInsuranceFundStake: new Uint8Array([251, 144, 115, 11, 222, 47, 62, 236]),
    requestRemoveInsuranceFundStake: new Uint8Array([142, 70, 204, 92, 73, 106, 180, 52]),
    cancelRequestRemoveInsuranceFundStake: new Uint8Array([97, 235, 78, 62, 212, 42, 241, 127]),
    removeInsuranceFundStake: new Uint8Array([128, 166, 142, 9, 254, 187, 143, 174])
} as const;

function isCompiledMessageShape(value: unknown): value is CompiledMessageShape {
    if (typeof value !== "object" || value === null) return false;
    if (!("compiledInstructions" in value) || !("staticAccountKeys" in value)) return false;

    const compiledInstructions = value.compiledInstructions;
    const staticAccountKeys = value.staticAccountKeys;

    return Array.isArray(compiledInstructions) && Array.isArray(staticAccountKeys);
}

function u64LE(value: bigint): Uint8Array {
    const buf = new ArrayBuffer(8);
    new DataView(buf).setBigUint64(0, value, true);
    return new Uint8Array(buf);
}

function u128LE(value: bigint): Uint8Array {
    const buf = new ArrayBuffer(16);
    const view = new DataView(buf);
    view.setBigUint64(0, value & U64_MASK, true);
    view.setBigUint64(8, value >> BigInt(64), true);
    return new Uint8Array(buf);
}

function concat(...parts: Uint8Array[]): Uint8Array {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

@Injectable()
export class StakingService {
    constructor(
        private readonly configService: ConfigService,
        private readonly clusterProvider: ClusterProvider,
        private readonly heliusResolver: HeliusResolver
    ) {}

    async getPosition(dto: GetStakingPositionDto): Promise<StakingPositionResponse | null> {
        const { rpc, owner, pdas } = this.resolveStakingContext(dto.wallet);
        const ifInfo = await rpc.getAccountInfo(pdas.insuranceFund, "confirmed");
        if (!ifInfo) return null;

        const fund = decodeInsuranceFund(ifInfo.data);
        const [stakeInfo, vaultBalance] = await Promise.all([
            rpc.getAccountInfo(pdas.ifStake, "confirmed"),
            rpc.getTokenAccountBalance(fund.vaultTokenAccount, "confirmed").catch(() => null)
        ]);
        if (!stakeInfo) return null;

        const stake = decodeIFStakeAccount(stakeInfo.data);
        const vaultUnits = vaultBalance ? BigInt(vaultBalance.value.amount) : ZERO;
        const estimatedSol = estimateShareValue(stake.ifShares, fund.totalShares, vaultUnits);
        const pendingValue = estimateShareValue(stake.lastWithdrawRequestShares, fund.totalShares, vaultUnits);
        const now = Math.floor(Date.now() / 1000);
        const cooldownEndsAt = stake.lastWithdrawRequestShares > ZERO ? stake.lastWithdrawRequestTs + fund.unstakingPeriod : 0;
        const canWithdraw = stake.lastWithdrawRequestShares > ZERO && now >= cooldownEndsAt;
        void owner;

        return {
            ifShares: stake.ifShares.toString(),
            totalShares: fund.totalShares.toString(),
            vaultJitoTokenUnits: vaultUnits.toString(),
            estimatedSol,
            lastWithdrawRequestShares: stake.lastWithdrawRequestShares.toString(),
            lastWithdrawRequestValue: pendingValue,
            lastWithdrawRequestTs: stake.lastWithdrawRequestTs,
            cooldownEndsAt,
            canWithdraw,
            unstakingPeriod: fund.unstakingPeriod,
            fund: serializeFund(fund)
        };
    }

    async getHistory(dto: GetStakingHistoryDto): Promise<StakingHistoryResponse> {
        const { rpc, pdas, ifProgramId } = this.resolveStakingContext(dto.wallet);
        const page = dto.page ?? 1;
        const pageSize = dto.pageSize ?? 8;
        const allSigs = await rpc.getSignaturesForAddress(pdas.ifStake, { limit: 100 });
        const total = allSigs.length;
        const start = (page - 1) * pageSize;
        const pageSigs = allSigs.slice(start, start + pageSize);

        const records = (
            await Promise.all(
                pageSigs.map(async (sigInfo): Promise<StakeHistoryRecord | null> => {
                    const tx = await rpc.getTransaction(sigInfo.signature, {
                        maxSupportedTransactionVersion: 0,
                        commitment: "confirmed"
                    });
                    if (!tx) return null;

                    const actionType = classifyStakeAction(tx.meta?.logMessages ?? []);
                    if (!actionType) return null;

                    const amountSol = this.parseAmountFromTransaction(tx.transaction.message, ifProgramId, actionType);
                    const status: StakeRecordStatus = tx.meta?.err
                        ? "failed"
                        : actionType === "unstake"
                          ? "cooling_down"
                          : actionType === "withdraw"
                            ? "withdrawn"
                            : "confirmed";

                    return {
                        id: sigInfo.signature,
                        stakeAccountAddress: pdas.ifStake.toBase58(),
                        createdAt: new Date((sigInfo.blockTime ?? 0) * 1000).toISOString(),
                        actionType,
                        status,
                        amountSol,
                        signature: sigInfo.signature
                    };
                })
            )
        ).filter((record): record is StakeHistoryRecord => record !== null);

        return { records, total };
    }

    async buildTransaction(dto: BuildStakingTransactionDto): Promise<BuiltStakingTransaction> {
        const network = this.getConfiguredNetwork();
        this.assertRequestCluster(network);

        const owner = this.parsePublicKey(dto.wallet, "wallet");
        const amountLamports = this.parseAmountLamports(dto);
        const ifProgramId = this.getRequiredPublicKey("staking.ifProgramId", "IF_PROGRAM_ID");
        const ifAuthority = this.getRequiredPublicKey("staking.ifAuthority", "IF_AUTHORITY");
        const pdas = this.getPdas(ifProgramId, ifAuthority, owner);
        const rpc = this.heliusResolver.forCluster(network);
        const fundInfo = await rpc.getAccountInfo(pdas.insuranceFund, "confirmed");

        if (!fundInfo) {
            throw new NotFoundException("Insurance Fund is not initialized for the configured authority.");
        }

        const fund = decodeInsuranceFund(fundInfo.data);
        const instruction = await this.buildInstruction(dto.action, {
            ifProgramId,
            owner,
            pdas,
            fund,
            amountLamports
        });
        const latestBlockhash = await rpc.getLatestBlockhash("confirmed");
        const message = new TransactionMessage({
            payerKey: owner,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: [instruction]
        }).compileToV0Message();
        const tx = new VersionedTransaction(message);

        return {
            action: dto.action,
            network,
            transaction: Buffer.from(tx.serialize()).toString("base64"),
            blockhash: latestBlockhash.blockhash,
            lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
        };
    }

    private async buildInstruction(
        action: StakingTransactionAction,
        params: {
            ifProgramId: PublicKey;
            owner: PublicKey;
            pdas: ResolvedPdas;
            fund: InsuranceFundState;
            amountLamports: bigint | null;
        }
    ): Promise<TransactionInstruction> {
        switch (action) {
            case "stake":
                return this.buildStakeInstruction(params);
            case "request-unstake":
                return this.buildRequestUnstakeInstruction(params);
            case "unstake":
                return this.buildUnstakeInstruction(params);
            case "cancel-request":
                return this.buildCancelRequestInstruction(params);
        }
    }

    private buildStakeInstruction(params: {
        ifProgramId: PublicKey;
        owner: PublicKey;
        pdas: ResolvedPdas;
        fund: InsuranceFundState;
        amountLamports: bigint | null;
    }): TransactionInstruction {
        const amountLamports = this.requirePositiveAmount(params.amountLamports, "stake");
        return new TransactionInstruction({
            programId: params.ifProgramId,
            keys: [
                { pubkey: params.owner, isSigner: true, isWritable: true },
                { pubkey: params.pdas.insuranceFund, isSigner: false, isWritable: true },
                { pubkey: params.fund.vaultTokenAccount, isSigner: false, isWritable: true },
                { pubkey: params.pdas.ifStake, isSigner: false, isWritable: true },
                ...this.stakePoolDepositKeys(params.fund)
            ],
            data: concat(DISC.addInsuranceFundStake, u64LE(amountLamports)) as Buffer
        });
    }

    private async buildRequestUnstakeInstruction(params: {
        ifProgramId: PublicKey;
        owner: PublicKey;
        pdas: ResolvedPdas;
        fund: InsuranceFundState;
        amountLamports: bigint | null;
    }): Promise<TransactionInstruction> {
        const requestedLamports = this.requirePositiveAmount(params.amountLamports, "request-unstake");
        const rpc = this.heliusResolver.forCluster(this.getConfiguredNetwork());
        const [stakeInfo, vaultBalance] = await Promise.all([
            rpc.getAccountInfo(params.pdas.ifStake, "confirmed"),
            rpc.getTokenAccountBalance(params.fund.vaultTokenAccount, "confirmed").catch(() => null)
        ]);

        if (!stakeInfo) {
            throw new NotFoundException("No active Insurance Fund stake account found for this wallet.");
        }

        const userShares = readU128LE(stakeInfo.data, 8 + 32);
        const vaultUnits = vaultBalance ? BigInt(vaultBalance.value.amount) : ZERO;
        let sharesToUnstake = userShares;

        if (vaultUnits > ZERO && params.fund.totalShares > ZERO) {
            sharesToUnstake = (requestedLamports * params.fund.totalShares) / vaultUnits;
            if (sharesToUnstake > userShares) sharesToUnstake = userShares;
        }

        if (sharesToUnstake <= ZERO) {
            throw new BadRequestException("No active shares available to unstake.");
        }

        return new TransactionInstruction({
            programId: params.ifProgramId,
            keys: [
                { pubkey: params.owner, isSigner: true, isWritable: true },
                { pubkey: params.pdas.insuranceFund, isSigner: false, isWritable: false },
                { pubkey: params.pdas.ifStake, isSigner: false, isWritable: true }
            ],
            data: concat(DISC.requestRemoveInsuranceFundStake, u128LE(sharesToUnstake)) as Buffer
        });
    }

    private buildUnstakeInstruction(params: {
        ifProgramId: PublicKey;
        owner: PublicKey;
        pdas: ResolvedPdas;
        fund: InsuranceFundState;
    }): TransactionInstruction {
        return new TransactionInstruction({
            programId: params.ifProgramId,
            keys: [
                { pubkey: params.owner, isSigner: true, isWritable: true },
                { pubkey: params.pdas.insuranceFund, isSigner: false, isWritable: true },
                { pubkey: params.pdas.ifStake, isSigner: false, isWritable: true },
                { pubkey: params.fund.vault, isSigner: false, isWritable: true },
                { pubkey: params.fund.vaultTokenAccount, isSigner: false, isWritable: true },
                ...this.stakePoolWithdrawKeys(params.fund)
            ],
            data: DISC.removeInsuranceFundStake as Buffer
        });
    }

    private buildCancelRequestInstruction(params: { ifProgramId: PublicKey; owner: PublicKey; pdas: ResolvedPdas }): TransactionInstruction {
        return new TransactionInstruction({
            programId: params.ifProgramId,
            keys: [
                { pubkey: params.owner, isSigner: true, isWritable: false },
                { pubkey: params.pdas.insuranceFund, isSigner: false, isWritable: false },
                { pubkey: params.pdas.ifStake, isSigner: false, isWritable: true }
            ],
            data: DISC.cancelRequestRemoveInsuranceFundStake as Buffer
        });
    }

    private stakePoolDepositKeys(fund: InsuranceFundState): AccountMeta[] {
        return [
            { pubkey: fund.stakePool, isSigner: false, isWritable: true },
            { pubkey: fund.withdrawAuthority, isSigner: false, isWritable: false },
            { pubkey: fund.reserveStake, isSigner: false, isWritable: true },
            { pubkey: fund.managerFeeAccount, isSigner: false, isWritable: true },
            { pubkey: fund.poolMint, isSigner: false, isWritable: true },
            { pubkey: fund.stakePoolProgram, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
        ];
    }

    private stakePoolWithdrawKeys(fund: InsuranceFundState): AccountMeta[] {
        return [
            { pubkey: fund.stakePool, isSigner: false, isWritable: true },
            { pubkey: fund.withdrawAuthority, isSigner: false, isWritable: false },
            { pubkey: fund.reserveStake, isSigner: false, isWritable: true },
            { pubkey: fund.managerFeeAccount, isSigner: false, isWritable: true },
            { pubkey: fund.poolMint, isSigner: false, isWritable: true },
            { pubkey: SYSVAR_CLOCK_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: SYSVAR_STAKE_HISTORY_PUBKEY, isSigner: false, isWritable: false },
            { pubkey: StakeProgram.programId, isSigner: false, isWritable: false },
            { pubkey: fund.stakePoolProgram, isSigner: false, isWritable: false },
            { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
            { pubkey: SystemProgram.programId, isSigner: false, isWritable: false }
        ];
    }

    private resolveStakingContext(wallet: string) {
        const network = this.getConfiguredNetwork();
        this.assertRequestCluster(network);
        const owner = this.parsePublicKey(wallet, "wallet");
        const ifProgramId = this.getRequiredPublicKey("staking.ifProgramId", "IF_PROGRAM_ID");
        const ifAuthority = this.getRequiredPublicKey("staking.ifAuthority", "IF_AUTHORITY");
        const pdas = this.getPdas(ifProgramId, ifAuthority, owner);
        const rpc = this.heliusResolver.forCluster(network);
        return { network, owner, ifProgramId, ifAuthority, pdas, rpc };
    }

    private parseAmountFromTransaction(message: unknown, ifProgramId: PublicKey, actionType: StakeActionType): string {
        if (!isCompiledMessageShape(message)) return "0";

        for (const ix of message.compiledInstructions) {
            const programKey = message.staticAccountKeys[ix.programIdIndex];
            if (!programKey || !programKey.equals(ifProgramId)) continue;
            return parseStakeAmountFromInstructionData(ix.data, actionType);
        }
        return "0";
    }

    private getPdas(ifProgramId: PublicKey, ifAuthority: PublicKey, owner: PublicKey): ResolvedPdas {
        const [insuranceFund] = PublicKey.findProgramAddressSync([encoder.encode("insurance_fund"), ifAuthority.toBuffer()], ifProgramId);
        const [vault] = PublicKey.findProgramAddressSync([encoder.encode("if_vault"), insuranceFund.toBuffer()], ifProgramId);
        const [ifStake] = PublicKey.findProgramAddressSync([encoder.encode("if_stake"), insuranceFund.toBuffer(), owner.toBuffer()], ifProgramId);
        return { insuranceFund, vault, ifStake };
    }

    private parseAmountLamports(dto: BuildStakingTransactionDto): bigint | null {
        if (dto.amountLamports == null) return null;
        return BigInt(dto.amountLamports);
    }

    private requirePositiveAmount(amountLamports: bigint | null, action: StakingTransactionAction): bigint {
        if (amountLamports == null || amountLamports <= ZERO) {
            throw new BadRequestException(`amountLamports is required for ${action}.`);
        }
        return amountLamports;
    }

    private getConfiguredNetwork(): Cluster {
        const network = this.configService.get<string>("staking.network");
        if (network === "devnet" || network === "mainnet") return network;
        if (network === "mainnet-beta") return "mainnet";
        throw new BadRequestException("Invalid SOLANA_NETWORK for staking. Use devnet or mainnet.");
    }

    private assertRequestCluster(network: Cluster) {
        if (this.clusterProvider.cluster !== network) {
            throw new BadRequestException(`Staking is configured for ${network}, but request cluster is ${this.clusterProvider.cluster}.`);
        }
    }

    private getRequiredPublicKey(configKey: string, envName: string): PublicKey {
        const value = this.configService.get<string>(configKey);
        if (!value) {
            throw new BadRequestException(`${envName} is required to build staking transactions.`);
        }
        return this.parsePublicKey(value, envName);
    }

    private parsePublicKey(value: string, label: string): PublicKey {
        try {
            return new PublicKey(value);
        } catch {
            throw new BadRequestException(`Invalid ${label} public key.`);
        }
    }
}

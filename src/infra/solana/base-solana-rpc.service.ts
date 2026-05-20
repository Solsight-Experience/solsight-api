import {
    PublicKey,
    Commitment,
    GetBalanceConfig,
    RpcResponseAndContext,
    GetSupplyConfig,
    Supply,
    TokenAmount,
    TokenAccountsFilter,
    GetTokenAccountsByOwnerConfig,
    GetProgramAccountsResponse,
    AccountInfo,
    ParsedAccountData,
    GetLargestAccountsConfig,
    AccountBalancePair,
    TokenAccountBalancePair,
    GetAccountInfoConfig,
    GetMultipleAccountsConfig,
    GetProgramAccountsConfig,
    GetParsedProgramAccountsConfig,
    TransactionConfirmationStrategy,
    SignatureResult,
    ContactInfo,
    VoteAccountStatus,
    GetSlotConfig,
    GetSlotLeaderConfig,
    TransactionSignature,
    SignatureStatusConfig,
    SignatureStatus,
    GetTransactionCountConfig,
    InflationGovernor,
    GetInflationRewardConfig,
    InflationReward,
    InflationRate,
    GetEpochInfoConfig,
    EpochInfo,
    EpochSchedule,
    LeaderSchedule,
    PerfSample,
    VersionedMessage,
    GetRecentPrioritizationFeesConfig,
    RecentPrioritizationFees,
    GetLatestBlockhashConfig,
    BlockhashWithExpiryBlockHeight,
    Blockhash,
    IsBlockhashValidConfig,
    Version,
    GetVersionedBlockConfig,
    VersionedBlockResponse,
    VersionedAccountsModeBlockResponse,
    VersionedNoneModeBlockResponse,
    ParsedAccountsModeBlockResponse,
    ParsedNoneModeBlockResponse,
    GetBlockHeightConfig,
    GetBlockProductionConfig,
    BlockProduction,
    GetVersionedTransactionConfig,
    VersionedTransactionResponse,
    Finality,
    ParsedTransactionWithMeta,
    BlockSignatures,
    SignaturesForAddressOptions,
    ConfirmedSignatureInfo,
    AddressLookupTableAccount,
    GetNonceAndContextConfig,
    NonceAccount,
    GetNonceConfig,
    GetStakeMinimumDelegationConfig,
    VersionedTransaction,
    SimulateTransactionConfig,
    SimulatedTransactionResponse,
    SendOptions,
    Connection,
    ConnectionConfig
} from "@solana/web3.js";
import { SolanaRpcService } from "./interfaces/solana-rpc-service.interface";

export class BaseSolanaRpcService implements SolanaRpcService {
    private readonly connection: Connection;

    constructor(rpcUrl: string, commitmentOrConfig?: Commitment | ConnectionConfig) {
        this.connection = new Connection(rpcUrl, commitmentOrConfig);
    }

    getBalanceAndContext(publicKey: PublicKey, commitmentOrConfig?: Commitment | GetBalanceConfig): Promise<RpcResponseAndContext<number>> {
        return this.connection.getBalanceAndContext(publicKey, commitmentOrConfig);
    }

    getBalance(publicKey: PublicKey, commitmentOrConfig?: Commitment | GetBalanceConfig): Promise<number> {
        return this.connection.getBalance(publicKey, commitmentOrConfig);
    }
    getBlockTime(slot: number): Promise<number | null> {
        return this.connection.getBlockTime(slot);
    }
    getMinimumLedgerSlot(): Promise<number> {
        return this.connection.getMinimumLedgerSlot();
    }
    getFirstAvailableBlock(): Promise<number> {
        return this.connection.getFirstAvailableBlock();
    }
    getSupply(config?: GetSupplyConfig | Commitment): Promise<RpcResponseAndContext<Supply>> {
        return this.connection.getSupply(config);
    }
    getTokenSupply(tokenMintAddress: PublicKey, commitment?: Commitment): Promise<RpcResponseAndContext<TokenAmount>> {
        return this.connection.getTokenSupply(tokenMintAddress, commitment);
    }
    getTokenAccountBalance(tokenAddress: PublicKey, commitment?: Commitment): Promise<RpcResponseAndContext<TokenAmount>> {
        return this.connection.getTokenAccountBalance(tokenAddress, commitment);
    }
    getTokenAccountsByOwner(
        ownerAddress: PublicKey,
        filter: TokenAccountsFilter,
        commitmentOrConfig?: Commitment | GetTokenAccountsByOwnerConfig
    ): Promise<RpcResponseAndContext<GetProgramAccountsResponse>> {
        return this.connection.getTokenAccountsByOwner(ownerAddress, filter, commitmentOrConfig);
    }
    getParsedTokenAccountsByOwner(
        ownerAddress: PublicKey,
        filter: TokenAccountsFilter,
        commitment?: Commitment
    ): Promise<RpcResponseAndContext<Array<{ pubkey: PublicKey; account: AccountInfo<ParsedAccountData> }>>> {
        return this.connection.getParsedTokenAccountsByOwner(ownerAddress, filter, commitment);
    }
    getLargestAccounts(config?: GetLargestAccountsConfig): Promise<RpcResponseAndContext<Array<AccountBalancePair>>> {
        return this.connection.getLargestAccounts(config);
    }
    getTokenLargestAccounts(mintAddress: PublicKey, commitment?: Commitment): Promise<RpcResponseAndContext<Array<TokenAccountBalancePair>>> {
        return this.connection.getTokenLargestAccounts(mintAddress, commitment);
    }
    getAccountInfoAndContext(
        publicKey: PublicKey,
        commitmentOrConfig?: Commitment | GetAccountInfoConfig
    ): Promise<RpcResponseAndContext<AccountInfo<Buffer> | null>> {
        return this.connection.getAccountInfoAndContext(publicKey, commitmentOrConfig);
    }
    getParsedAccountInfo(
        publicKey: PublicKey,
        commitmentOrConfig?: Commitment | GetAccountInfoConfig
    ): Promise<RpcResponseAndContext<AccountInfo<Buffer | ParsedAccountData> | null>> {
        return this.connection.getParsedAccountInfo(publicKey, commitmentOrConfig);
    }
    getAccountInfo(publicKey: PublicKey, commitmentOrConfig?: Commitment | GetAccountInfoConfig): Promise<AccountInfo<Buffer> | null> {
        return this.connection.getAccountInfo(publicKey, commitmentOrConfig);
    }
    getMultipleParsedAccounts(
        publicKeys: PublicKey[],
        rawConfig?: GetMultipleAccountsConfig
    ): Promise<RpcResponseAndContext<(AccountInfo<Buffer | ParsedAccountData> | null)[]>> {
        return this.connection.getMultipleParsedAccounts(publicKeys, rawConfig);
    }
    getMultipleAccountsInfoAndContext(
        publicKeys: PublicKey[],
        commitmentOrConfig?: Commitment | GetMultipleAccountsConfig
    ): Promise<RpcResponseAndContext<(AccountInfo<Buffer> | null)[]>> {
        return this.connection.getMultipleAccountsInfoAndContext(publicKeys, commitmentOrConfig);
    }
    getMultipleAccountsInfo(publicKeys: PublicKey[], commitmentOrConfig?: Commitment | GetMultipleAccountsConfig): Promise<(AccountInfo<Buffer> | null)[]> {
        return this.connection.getMultipleAccountsInfo(publicKeys, commitmentOrConfig);
    }
    getProgramAccounts(
        programId: PublicKey,
        configOrCommitment: GetProgramAccountsConfig & Readonly<{ withContext: true }>
    ): Promise<RpcResponseAndContext<GetProgramAccountsResponse>>;
    getProgramAccounts(programId: PublicKey, configOrCommitment?: GetProgramAccountsConfig | Commitment): Promise<GetProgramAccountsResponse>;
    getProgramAccounts(
        programId: unknown,
        configOrCommitment?: unknown
    ): Promise<RpcResponseAndContext<GetProgramAccountsResponse>> | Promise<GetProgramAccountsResponse> {
        const programPubkey = programId as PublicKey;
        if (configOrCommitment) {
            return this.connection.getProgramAccounts(programPubkey, configOrCommitment);
        }
        return this.connection.getProgramAccounts(programPubkey, configOrCommitment as GetProgramAccountsConfig | Commitment);
    }
    getParsedProgramAccounts(
        programId: PublicKey,
        configOrCommitment?: GetParsedProgramAccountsConfig | Commitment
    ): Promise<Array<{ pubkey: PublicKey; account: AccountInfo<Buffer | ParsedAccountData> }>> {
        return this.connection.getParsedProgramAccounts(programId, configOrCommitment);
    }
    confirmTransaction(strategy: TransactionConfirmationStrategy, commitment?: Commitment): Promise<RpcResponseAndContext<SignatureResult>> {
        return this.connection.confirmTransaction(strategy, commitment);
    }
    getClusterNodes(): Promise<Array<ContactInfo>> {
        return this.connection.getClusterNodes();
    }
    getVoteAccounts(commitment?: Commitment): Promise<VoteAccountStatus> {
        return this.connection.getVoteAccounts(commitment);
    }
    getSlot(commitmentOrConfig?: Commitment | GetSlotConfig): Promise<number> {
        return this.connection.getSlot(commitmentOrConfig);
    }
    getSlotLeader(commitmentOrConfig?: Commitment | GetSlotLeaderConfig): Promise<string> {
        return this.connection.getSlotLeader(commitmentOrConfig);
    }
    getSlotLeaders(startSlot: number, limit: number): Promise<Array<PublicKey>> {
        return this.connection.getSlotLeaders(startSlot, limit);
    }
    getSignatureStatus(signature: TransactionSignature, config?: SignatureStatusConfig): Promise<RpcResponseAndContext<SignatureStatus | null>> {
        return this.connection.getSignatureStatus(signature, config);
    }
    getSignatureStatuses(
        signatures: Array<TransactionSignature>,
        config?: SignatureStatusConfig
    ): Promise<RpcResponseAndContext<Array<SignatureStatus | null>>> {
        return this.connection.getSignatureStatuses(signatures, config);
    }
    getTransactionCount(commitmentOrConfig?: Commitment | GetTransactionCountConfig): Promise<number> {
        return this.connection.getTransactionCount(commitmentOrConfig);
    }
    getInflationGovernor(commitment?: Commitment): Promise<InflationGovernor> {
        return this.connection.getInflationGovernor(commitment);
    }
    getInflationReward(
        addresses: PublicKey[],
        epoch?: number,
        commitmentOrConfig?: Commitment | GetInflationRewardConfig
    ): Promise<(InflationReward | null)[]> {
        return this.connection.getInflationReward(addresses, epoch, commitmentOrConfig);
    }
    getInflationRate(): Promise<InflationRate> {
        return this.connection.getInflationRate();
    }
    getEpochInfo(commitmentOrConfig?: Commitment | GetEpochInfoConfig): Promise<EpochInfo> {
        return this.connection.getEpochInfo(commitmentOrConfig);
    }
    getEpochSchedule(): Promise<EpochSchedule> {
        return this.connection.getEpochSchedule();
    }
    getLeaderSchedule(): Promise<LeaderSchedule> {
        return this.connection.getLeaderSchedule();
    }
    getMinimumBalanceForRentExemption(dataLength: number, commitment?: Commitment): Promise<number> {
        return this.connection.getMinimumBalanceForRentExemption(dataLength, commitment);
    }
    getRecentPerformanceSamples(limit?: number): Promise<Array<PerfSample>> {
        return this.connection.getRecentPerformanceSamples(limit);
    }
    getFeeForMessage(message: VersionedMessage, commitment?: Commitment): Promise<RpcResponseAndContext<number | null>> {
        return this.connection.getFeeForMessage(message, commitment);
    }
    getRecentPrioritizationFees(config?: GetRecentPrioritizationFeesConfig): Promise<RecentPrioritizationFees[]> {
        return this.connection.getRecentPrioritizationFees(config);
    }
    getLatestBlockhash(commitmentOrConfig?: Commitment | GetLatestBlockhashConfig): Promise<BlockhashWithExpiryBlockHeight> {
        return this.connection.getLatestBlockhash(commitmentOrConfig);
    }
    getLatestBlockhashAndContext(commitmentOrConfig?: Commitment | GetLatestBlockhashConfig): Promise<RpcResponseAndContext<BlockhashWithExpiryBlockHeight>> {
        return this.connection.getLatestBlockhashAndContext(commitmentOrConfig);
    }
    isBlockhashValid(blockhash: Blockhash, rawConfig?: IsBlockhashValidConfig): Promise<RpcResponseAndContext<boolean>> {
        return this.connection.isBlockhashValid(blockhash, rawConfig);
    }
    getVersion(): Promise<Version> {
        return this.connection.getVersion();
    }
    getGenesisHash(): Promise<string> {
        return this.connection.getGenesisHash();
    }
    getBlock(slot: number, rawConfig?: GetVersionedBlockConfig): Promise<VersionedBlockResponse | null>;
    getBlock(slot: number, rawConfig: GetVersionedBlockConfig & { transactionDetails: "accounts" }): Promise<VersionedAccountsModeBlockResponse | null>;
    getBlock(slot: number, rawConfig: GetVersionedBlockConfig & { transactionDetails: "none" }): Promise<VersionedNoneModeBlockResponse | null>;
    getBlock(
        slot: unknown,
        rawConfig?: unknown
    ): Promise<VersionedBlockResponse | null> | Promise<VersionedAccountsModeBlockResponse | null> | Promise<VersionedNoneModeBlockResponse | null> {
        if (typeof slot !== "number") {
            throw new Error("slot must be a number");
        }

        const config = rawConfig as GetVersionedBlockConfig | undefined;

        if (!config || config.transactionDetails === undefined) {
            return this.connection.getBlock(slot, config);
        }

        if (config.transactionDetails === "accounts") {
            return this.connection.getBlock(slot, config);
        }

        if (config.transactionDetails === "none") {
            return this.connection.getBlock(slot, config);
        }

        return this.connection.getBlock(slot, config);
    }
    getParsedBlock(slot: number, rawConfig?: GetVersionedBlockConfig): Promise<ParsedAccountsModeBlockResponse>;
    getParsedBlock(slot: number, rawConfig: GetVersionedBlockConfig & { transactionDetails: "accounts" }): Promise<ParsedAccountsModeBlockResponse>;
    getParsedBlock(slot: number, rawConfig: GetVersionedBlockConfig & { transactionDetails: "none" }): Promise<ParsedNoneModeBlockResponse>;
    getParsedBlock(slot: unknown, rawConfig?: unknown): Promise<ParsedAccountsModeBlockResponse> | Promise<ParsedNoneModeBlockResponse> {
        if (typeof slot !== "number") {
            throw new Error("slot must be a number");
        }

        const config = rawConfig as GetVersionedBlockConfig | undefined;

        if (!config || config.transactionDetails === undefined) {
            // default = accounts (based on your overloads)
            return this.connection.getParsedBlock(slot, config);
        }

        if (config.transactionDetails === "accounts") {
            return this.connection.getParsedBlock(slot, config);
        }

        if (config.transactionDetails === "none") {
            return this.connection.getParsedBlock(slot, config);
        }

        // fallback (if other values exist like "full")
        return this.connection.getParsedBlock(slot, config);
    }
    getBlockHeight: (commitmentOrConfig?: Commitment | GetBlockHeightConfig) => Promise<number>;
    getBlockProduction(configOrCommitment?: GetBlockProductionConfig | Commitment): Promise<RpcResponseAndContext<BlockProduction>> {
        return this.connection.getBlockProduction(configOrCommitment);
    }
    getTransaction(signature: string, rawConfig: GetVersionedTransactionConfig): Promise<VersionedTransactionResponse | null> {
        return this.connection.getTransaction(signature, rawConfig);
    }
    getParsedTransaction(
        signature: TransactionSignature,
        commitmentOrConfig?: GetVersionedTransactionConfig | Finality
    ): Promise<ParsedTransactionWithMeta | null> {
        return this.connection.getParsedTransaction(signature, commitmentOrConfig);
    }
    getParsedTransactions(
        signatures: TransactionSignature[],
        commitmentOrConfig?: GetVersionedTransactionConfig | Finality
    ): Promise<(ParsedTransactionWithMeta | null)[]> {
        return this.connection.getParsedTransactions(signatures, commitmentOrConfig);
    }
    getTransactions(
        signatures: TransactionSignature[],
        commitmentOrConfig: GetVersionedTransactionConfig | Finality
    ): Promise<(VersionedTransactionResponse | null)[]> {
        return this.connection.getTransactions(signatures, commitmentOrConfig);
    }
    getBlocks(startSlot: number, endSlot?: number, commitment?: Finality): Promise<Array<number>> {
        return this.connection.getBlocks(startSlot, endSlot, commitment);
    }
    getBlockSignatures(slot: number, commitment?: Finality): Promise<BlockSignatures> {
        return this.connection.getBlockSignatures(slot, commitment);
    }
    getSignaturesForAddress(address: PublicKey, options?: SignaturesForAddressOptions, commitment?: Finality): Promise<Array<ConfirmedSignatureInfo>> {
        return this.connection.getSignaturesForAddress(address, options, commitment);
    }
    getAddressLookupTable(accountKey: PublicKey, config?: GetAccountInfoConfig): Promise<RpcResponseAndContext<AddressLookupTableAccount | null>> {
        return this.connection.getAddressLookupTable(accountKey, config);
    }
    getNonceAndContext(
        nonceAccount: PublicKey,
        commitmentOrConfig?: Commitment | GetNonceAndContextConfig
    ): Promise<RpcResponseAndContext<NonceAccount | null>> {
        return this.connection.getNonceAndContext(nonceAccount, commitmentOrConfig);
    }
    getNonce(nonceAccount: PublicKey, commitmentOrConfig?: Commitment | GetNonceConfig): Promise<NonceAccount | null> {
        return this.connection.getNonce(nonceAccount, commitmentOrConfig);
    }
    requestAirdrop(to: PublicKey, lamports: number): Promise<TransactionSignature> {
        return this.connection.requestAirdrop(to, lamports);
    }
    getStakeMinimumDelegation(config?: GetStakeMinimumDelegationConfig): Promise<RpcResponseAndContext<number>> {
        return this.connection.getStakeMinimumDelegation(config);
    }
    simulateTransaction(transaction: VersionedTransaction, config?: SimulateTransactionConfig): Promise<RpcResponseAndContext<SimulatedTransactionResponse>> {
        return this.connection.simulateTransaction(transaction, config);
    }
    sendTransaction(transaction: VersionedTransaction, options?: SendOptions): Promise<TransactionSignature> {
        return this.connection.sendTransaction(transaction, options);
    }
    sendRawTransaction(rawTransaction: Buffer | Uint8Array | Array<number>, options?: SendOptions): Promise<TransactionSignature> {
        return this.connection.sendRawTransaction(rawTransaction, options);
    }
    sendEncodedTransaction(encodedTransaction: string, options?: SendOptions): Promise<TransactionSignature> {
        return this.connection.sendEncodedTransaction(encodedTransaction, options);
    }
}

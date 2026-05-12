import {
    AccountBalancePair,
    AccountInfo,
    AddressLookupTableAccount,
    Blockhash,
    BlockhashWithExpiryBlockHeight,
    BlockProduction,
    BlockSignatures,
    Commitment,
    ConfirmedSignatureInfo,
    ContactInfo,
    EpochInfo,
    EpochSchedule,
    Finality,
    GetAccountInfoConfig,
    GetBalanceConfig,
    GetBlockHeightConfig,
    GetBlockProductionConfig,
    GetEpochInfoConfig,
    GetInflationRewardConfig,
    GetLargestAccountsConfig,
    GetLatestBlockhashConfig,
    GetMultipleAccountsConfig,
    GetNonceAndContextConfig,
    GetNonceConfig,
    GetParsedProgramAccountsConfig,
    GetProgramAccountsConfig,
    GetProgramAccountsResponse,
    GetRecentPrioritizationFeesConfig,
    GetSlotConfig,
    GetSlotLeaderConfig,
    GetStakeActivationConfig,
    GetStakeMinimumDelegationConfig,
    GetSupplyConfig,
    GetTokenAccountsByOwnerConfig,
    GetTransactionCountConfig,
    GetVersionedBlockConfig,
    GetVersionedTransactionConfig,
    InflationGovernor,
    InflationRate,
    InflationReward,
    IsBlockhashValidConfig,
    LeaderSchedule,
    NonceAccount,
    ParsedAccountData,
    ParsedAccountsModeBlockResponse,
    ParsedNoneModeBlockResponse,
    ParsedTransactionWithMeta,
    PerfSample,
    PublicKey,
    RecentPrioritizationFees,
    RpcResponseAndContext,
    SendOptions,
    SignatureResult,
    SignaturesForAddressOptions,
    SignatureStatus,
    SignatureStatusConfig,
    SimulatedTransactionResponse,
    SimulateTransactionConfig,
    StakeActivationData,
    Supply,
    TokenAccountBalancePair,
    TokenAccountsFilter,
    TokenAmount,
    TransactionConfirmationStrategy,
    TransactionSignature,
    Version,
    VersionedAccountsModeBlockResponse,
    VersionedBlockResponse,
    VersionedMessage,
    VersionedNoneModeBlockResponse,
    VersionedTransaction,
    VersionedTransactionResponse,
    VoteAccountStatus
} from "@solana/web3.js";

export interface SolanaRpcService {
    /**
     * Fetch the balance for the specified public key, return with context
     */
    getBalanceAndContext(publicKey: PublicKey, commitmentOrConfig?: Commitment | GetBalanceConfig): Promise<RpcResponseAndContext<number>>;
    /**
     * Fetch the balance for the specified public key
     */
    getBalance(publicKey: PublicKey, commitmentOrConfig?: Commitment | GetBalanceConfig): Promise<number>;
    /**
     * Fetch the estimated production time of a block
     */
    getBlockTime(slot: number): Promise<number | null>;
    /**
     * Fetch the lowest slot that the node has information about in its ledger.
     * This value may increase over time if the node is configured to purge older ledger data
     */
    getMinimumLedgerSlot(): Promise<number>;
    /**
     * Fetch the slot of the lowest confirmed block that has not been purged from the ledger
     */
    getFirstAvailableBlock(): Promise<number>;
    /**
     * Fetch information about the current supply
     */
    getSupply(config?: GetSupplyConfig | Commitment): Promise<RpcResponseAndContext<Supply>>;
    /**
     * Fetch the current supply of a token mint
     */
    getTokenSupply(tokenMintAddress: PublicKey, commitment?: Commitment): Promise<RpcResponseAndContext<TokenAmount>>;
    /**
     * Fetch the current balance of a token account
     */
    getTokenAccountBalance(tokenAddress: PublicKey, commitment?: Commitment): Promise<RpcResponseAndContext<TokenAmount>>;
    /**
     * Fetch all the token accounts owned by the specified account
     *
     * @return {Promise<RpcResponseAndContext<GetProgramAccountsResponse>}
     */
    getTokenAccountsByOwner(
        ownerAddress: PublicKey,
        filter: TokenAccountsFilter,
        commitmentOrConfig?: Commitment | GetTokenAccountsByOwnerConfig
    ): Promise<RpcResponseAndContext<GetProgramAccountsResponse>>;
    /**
     * Fetch parsed token accounts owned by the specified account
     *
     * @return {Promise<RpcResponseAndContext<Array<{pubkey: PublicKey, account: AccountInfo<ParsedAccountData>}>>>}
     */
    getParsedTokenAccountsByOwner(
        ownerAddress: PublicKey,
        filter: TokenAccountsFilter,
        commitment?: Commitment
    ): Promise<
        RpcResponseAndContext<
            Array<{
                pubkey: PublicKey;
                account: AccountInfo<ParsedAccountData>;
            }>
        >
    >;
    /**
     * Fetch the 20 largest accounts with their current balances
     */
    getLargestAccounts(config?: GetLargestAccountsConfig): Promise<RpcResponseAndContext<Array<AccountBalancePair>>>;
    /**
     * Fetch the 20 largest token accounts with their current balances
     * for a given mint.
     */
    getTokenLargestAccounts(mintAddress: PublicKey, commitment?: Commitment): Promise<RpcResponseAndContext<Array<TokenAccountBalancePair>>>;
    /**
     * Fetch all the account info for the specified public key, return with context
     */
    getAccountInfoAndContext(
        publicKey: PublicKey,
        commitmentOrConfig?: Commitment | GetAccountInfoConfig
    ): Promise<RpcResponseAndContext<AccountInfo<Buffer> | null>>;
    /**
     * Fetch parsed account info for the specified public key
     */
    getParsedAccountInfo(
        publicKey: PublicKey,
        commitmentOrConfig?: Commitment | GetAccountInfoConfig
    ): Promise<RpcResponseAndContext<AccountInfo<Buffer | ParsedAccountData> | null>>;
    /**
     * Fetch all the account info for the specified public key
     */
    getAccountInfo(publicKey: PublicKey, commitmentOrConfig?: Commitment | GetAccountInfoConfig): Promise<AccountInfo<Buffer> | null>;
    /**
     * Fetch all the account info for multiple accounts specified by an array of public keys, return with context
     */
    getMultipleParsedAccounts(
        publicKeys: PublicKey[],
        rawConfig?: GetMultipleAccountsConfig
    ): Promise<RpcResponseAndContext<(AccountInfo<Buffer | ParsedAccountData> | null)[]>>;
    /**
     * Fetch all the account info for multiple accounts specified by an array of public keys, return with context
     */
    getMultipleAccountsInfoAndContext(
        publicKeys: PublicKey[],
        commitmentOrConfig?: Commitment | GetMultipleAccountsConfig
    ): Promise<RpcResponseAndContext<(AccountInfo<Buffer> | null)[]>>;
    /**
     * Fetch all the account info for multiple accounts specified by an array of public keys
     */
    getMultipleAccountsInfo(publicKeys: PublicKey[], commitmentOrConfig?: Commitment | GetMultipleAccountsConfig): Promise<(AccountInfo<Buffer> | null)[]>;
    /**
     * Fetch all the accounts owned by the specified program id
     *
     * @return {Promise<Array<{pubkey: PublicKey, account: AccountInfo<Buffer>}>>}
     */
    getProgramAccounts(
        programId: PublicKey,
        configOrCommitment: GetProgramAccountsConfig &
            Readonly<{
                withContext: true;
            }>
    ): Promise<RpcResponseAndContext<GetProgramAccountsResponse>>;
    getProgramAccounts(programId: PublicKey, configOrCommitment?: GetProgramAccountsConfig | Commitment): Promise<GetProgramAccountsResponse>;
    /**
     * Fetch and parse all the accounts owned by the specified program id
     *
     * @return {Promise<Array<{pubkey: PublicKey, account: AccountInfo<Buffer | ParsedAccountData>}>>}
     */
    getParsedProgramAccounts(
        programId: PublicKey,
        configOrCommitment?: GetParsedProgramAccountsConfig | Commitment
    ): Promise<
        Array<{
            pubkey: PublicKey;
            account: AccountInfo<Buffer | ParsedAccountData>;
        }>
    >;
    confirmTransaction(strategy: TransactionConfirmationStrategy, commitment?: Commitment): Promise<RpcResponseAndContext<SignatureResult>>;
    /**
     * Return the list of nodes that are currently participating in the cluster
     */
    getClusterNodes(): Promise<Array<ContactInfo>>;
    /**
     * Return the list of nodes that are currently participating in the cluster
     */
    getVoteAccounts(commitment?: Commitment): Promise<VoteAccountStatus>;
    /**
     * Fetch the current slot that the node is processing
     */
    getSlot(commitmentOrConfig?: Commitment | GetSlotConfig): Promise<number>;
    /**
     * Fetch the current slot leader of the cluster
     */
    getSlotLeader(commitmentOrConfig?: Commitment | GetSlotLeaderConfig): Promise<string>;
    /**
     * Fetch `limit` number of slot leaders starting from `startSlot`
     *
     * @param startSlot fetch slot leaders starting from this slot
     * @param limit number of slot leaders to return
     */
    getSlotLeaders(startSlot: number, limit: number): Promise<Array<PublicKey>>;
    /**
     * Fetch the current status of a signature
     */
    getSignatureStatus(signature: TransactionSignature, config?: SignatureStatusConfig): Promise<RpcResponseAndContext<SignatureStatus | null>>;
    /**
     * Fetch the current statuses of a batch of signatures
     */
    getSignatureStatuses(
        signatures: Array<TransactionSignature>,
        config?: SignatureStatusConfig
    ): Promise<RpcResponseAndContext<Array<SignatureStatus | null>>>;
    /**
     * Fetch the current transaction count of the cluster
     */
    getTransactionCount(commitmentOrConfig?: Commitment | GetTransactionCountConfig): Promise<number>;
    /**
     * Fetch the cluster InflationGovernor parameters
     */
    getInflationGovernor(commitment?: Commitment): Promise<InflationGovernor>;
    /**
     * Fetch the inflation reward for a list of addresses for an epoch
     */
    getInflationReward(addresses: PublicKey[], epoch?: number, commitmentOrConfig?: Commitment | GetInflationRewardConfig): Promise<(InflationReward | null)[]>;
    /**
     * Fetch the specific inflation values for the current epoch
     */
    getInflationRate(): Promise<InflationRate>;
    /**
     * Fetch the Epoch Info parameters
     */
    getEpochInfo(commitmentOrConfig?: Commitment | GetEpochInfoConfig): Promise<EpochInfo>;
    /**
     * Fetch the Epoch Schedule parameters
     */
    getEpochSchedule(): Promise<EpochSchedule>;
    /**
     * Fetch the leader schedule for the current epoch
     * @return {Promise<RpcResponseAndContext<LeaderSchedule>>}
     */
    getLeaderSchedule(): Promise<LeaderSchedule>;
    /**
     * Fetch the minimum balance needed to exempt an account of `dataLength`
     * size from rent
     */
    getMinimumBalanceForRentExemption(dataLength: number, commitment?: Commitment): Promise<number>;
    /**
     * Fetch a recent blockhash from the cluster, return with context
     * @return {Promise<RpcResponseAndContext<{blockhash: Blockhash, feeCalculator: FeeCalculator}>>}
    /**
     * Fetch recent performance samples
     * @return {Promise<Array<PerfSample>>}
     */
    getRecentPerformanceSamples(limit?: number): Promise<Array<PerfSample>>;
    /**
     * Fetch the fee calculator for a recent blockhash from the cluster, return with context
    /**
     * Fetch the fee for a message from the cluster, return with context
     */
    getFeeForMessage(message: VersionedMessage, commitment?: Commitment): Promise<RpcResponseAndContext<number | null>>;
    /**
     * Fetch a list of prioritization fees from recent blocks.
     */
    getRecentPrioritizationFees(config?: GetRecentPrioritizationFeesConfig): Promise<RecentPrioritizationFees[]>;
    /**
     * Fetch the latest blockhash from the cluster
     * @return {Promise<BlockhashWithExpiryBlockHeight>}
     */
    getLatestBlockhash(commitmentOrConfig?: Commitment | GetLatestBlockhashConfig): Promise<BlockhashWithExpiryBlockHeight>;
    /**
     * Fetch the latest blockhash from the cluster
     * @return {Promise<BlockhashWithExpiryBlockHeight>}
     */
    getLatestBlockhashAndContext(commitmentOrConfig?: Commitment | GetLatestBlockhashConfig): Promise<RpcResponseAndContext<BlockhashWithExpiryBlockHeight>>;
    /**
     * Returns whether a blockhash is still valid or not
     */
    isBlockhashValid(blockhash: Blockhash, rawConfig?: IsBlockhashValidConfig): Promise<RpcResponseAndContext<boolean>>;
    /**
     * Fetch the node version
     */
    getVersion(): Promise<Version>;
    /**
     * Fetch the genesis hash
     */
    getGenesisHash(): Promise<string>;
    /**
     * Fetch a processed block from the cluster.
     */
    getBlock(slot: number, rawConfig?: GetVersionedBlockConfig): Promise<VersionedBlockResponse | null>;
    getBlock(
        slot: number,
        rawConfig: GetVersionedBlockConfig & {
            transactionDetails: "accounts";
        }
    ): Promise<VersionedAccountsModeBlockResponse | null>;
    getBlock(
        slot: number,
        rawConfig: GetVersionedBlockConfig & {
            transactionDetails: "none";
        }
    ): Promise<VersionedNoneModeBlockResponse | null>;
    /**
     * Fetch parsed transaction details for a confirmed or finalized block
     */
    getParsedBlock(slot: number, rawConfig?: GetVersionedBlockConfig): Promise<ParsedAccountsModeBlockResponse>;
    getParsedBlock(
        slot: number,
        rawConfig: GetVersionedBlockConfig & {
            transactionDetails: "accounts";
        }
    ): Promise<ParsedAccountsModeBlockResponse>;
    getParsedBlock(
        slot: number,
        rawConfig: GetVersionedBlockConfig & {
            transactionDetails: "none";
        }
    ): Promise<ParsedNoneModeBlockResponse>;
    getBlockHeight: (commitmentOrConfig?: Commitment | GetBlockHeightConfig) => Promise<number>;
    getBlockProduction(configOrCommitment?: GetBlockProductionConfig | Commitment): Promise<RpcResponseAndContext<BlockProduction>>;
    /**
     * Fetch a confirmed or finalized transaction from the cluster.
     */
    getTransaction(signature: string, rawConfig: GetVersionedTransactionConfig): Promise<VersionedTransactionResponse | null>;
    /**
     * Fetch parsed transaction details for a confirmed or finalized transaction
     */
    getParsedTransaction(
        signature: TransactionSignature,
        commitmentOrConfig?: GetVersionedTransactionConfig | Finality
    ): Promise<ParsedTransactionWithMeta | null>;
    /**
     * Fetch parsed transaction details for a batch of confirmed transactions
     */
    getParsedTransactions(
        signatures: TransactionSignature[],
        commitmentOrConfig?: GetVersionedTransactionConfig | Finality
    ): Promise<(ParsedTransactionWithMeta | null)[]>;
    /**
     * Fetch transaction details for a batch of confirmed transactions.
     * Similar to {@link getParsedTransactions} but returns a {@link
     * VersionedTransactionResponse}.
     */
    getTransactions(
        signatures: TransactionSignature[],
        commitmentOrConfig: GetVersionedTransactionConfig | Finality
    ): Promise<(VersionedTransactionResponse | null)[]>;
    /**
     * Fetch confirmed blocks between two slots
     */
    getBlocks(startSlot: number, endSlot?: number, commitment?: Finality): Promise<Array<number>>;
    /**
     * Fetch a list of Signatures from the cluster for a block, excluding rewards
     */
    getBlockSignatures(slot: number, commitment?: Finality): Promise<BlockSignatures>;
    /**
     * Returns confirmed signatures for transactions involving an
     * address backwards in time from the provided signature or most recent confirmed block
     *
     *
     * @param address queried address
     * @param options
     */
    getSignaturesForAddress(address: PublicKey, options?: SignaturesForAddressOptions, commitment?: Finality): Promise<Array<ConfirmedSignatureInfo>>;
    getAddressLookupTable(accountKey: PublicKey, config?: GetAccountInfoConfig): Promise<RpcResponseAndContext<AddressLookupTableAccount | null>>;
    /**
     * Fetch the contents of a Nonce account from the cluster, return with context
     */
    getNonceAndContext(
        nonceAccount: PublicKey,
        commitmentOrConfig?: Commitment | GetNonceAndContextConfig
    ): Promise<RpcResponseAndContext<NonceAccount | null>>;
    /**
     * Fetch the contents of a Nonce account from the cluster
     */
    getNonce(nonceAccount: PublicKey, commitmentOrConfig?: Commitment | GetNonceConfig): Promise<NonceAccount | null>;
    /**
     * Request an allocation of lamports to the specified address
     *
     * ```typescript
     * import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
     *
     * (async () => {
     *   const connection = new Connection("https://api.testnet.solana.com", "confirmed");
     *   const myAddress = new PublicKey("2nr1bHFT86W9tGnyvmYW4vcHKsQB3sVQfnddasz4kExM");
     *   const signature = await connection.requestAirdrop(myAddress, LAMPORTS_PER_SOL);
     *   await connection.confirmTransaction(signature);
     * })();
     * ```
     */
    requestAirdrop(to: PublicKey, lamports: number): Promise<TransactionSignature>;
    /**
     * get the stake minimum delegation
     */
    getStakeMinimumDelegation(config?: GetStakeMinimumDelegationConfig): Promise<RpcResponseAndContext<number>>;
    /**
     * Simulate a transaction
     */
    simulateTransaction(transaction: VersionedTransaction, config?: SimulateTransactionConfig): Promise<RpcResponseAndContext<SimulatedTransactionResponse>>;
    /**
     * Send a signed transaction
     */
    sendTransaction(transaction: VersionedTransaction, options?: SendOptions): Promise<TransactionSignature>;
    /**
     * Send a transaction that has already been signed and serialized into the
     * wire format
     */
    sendRawTransaction(rawTransaction: Buffer | Uint8Array | Array<number>, options?: SendOptions): Promise<TransactionSignature>;
    /**
     * Send a transaction that has already been signed, serialized into the
     * wire format, and encoded as a base64 string
     */
    sendEncodedTransaction(encodedTransaction: string, options?: SendOptions): Promise<TransactionSignature>;
}

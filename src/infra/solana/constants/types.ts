export type RpcResponse<T> = {
    jsonrpc: string;
    id: string;
    result: T;
};

export type HeliusCommitment = "finalized" | "confirmed";

export type HeliusTokenAccountsFilter = "none" | "balanceChanged" | "all";

export type HeliusSortOrder = "asc" | "desc";

export type GetEnhancedTransactionsByAddressParams = {
    beforeSignature?: string;
    afterSignature?: string;
    commitment?: HeliusCommitment;
    tokenAccounts?: HeliusTokenAccountsFilter;
    sortOrder?: HeliusSortOrder;
    gtSlot?: number;
    gteSlot?: number;
    ltSlot?: number;
    lteSlot?: number;
    gtTime?: number;
    gteTime?: number;
    ltTime?: number;
    lteTime?: number;
    source?: string;
    type?: string;
    limit?: number;
};

export type GetAssetResponse = {
    last_indexed_slot: number;
    interface: AssetInterface;
    id: string;
    content: {
        $schema: string;
        json_uri: string;
        files: object[];
        metadata: {
            name: string;
            symbol: string;
            attributes: {
                value: string;
                trait_type: string;
            }[];
            description: string;
            token_standard: string;
        };
        links: object;
    };
    authorities: {
        address: string;
        scopes: string[];
    }[];
    compression: {
        eligible: boolean;
        compressed: boolean;
        data_hash: string;
        creator_hash: string;
        asset_hash: string;
        tree: string;
        seq: number;
        leaf_id: number;
    };
    grouping: {
        group_key: string;
        group_value: string;
    }[];
    royalty: {
        royalty_model: string;
        target: string | null;
        percent: number;
        basis_points: number;
        primary_sale_happened: boolean;
        locked: boolean;
    };
    creators: {
        address: string;
        share: number;
        verified: boolean;
    }[];
    ownership: {
        forzen: boolean;
        delegated: boolean;
        ownership_model: string;
        owner: string;
        delegate: string | null;
    };
    supply: {
        print_max_supply: number;
        print_current_supply: number;
        edition_nonce: number;
    };
    mutable: boolean;
    burnt: boolean;
    token_info: {
        supply: number;
        decimals: number;
        token_program: string;
        mint_authority: string;
        freeze_authority: string;
    };
};

enum AssetInterface {
    V1_NFT,
    V1_PRINT,
    LEGACY_NFT,
    V2_NFT,
    FungibleAsset,
    FungibleToken,
    Custom,
    Identity,
    Executable,
    ProgrammableNFT
}

export type NativeTransfer = {
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
};

export type RawTokenAmount = {
    tokenAmount: string;
    decimals: number;
};

export type TokenBalanceChange = {
    userAccount: string;
    tokenAccount: string;
    mint: string;
    rawTokenAmount: RawTokenAmount;
};

export type TokenTransfer = {
    fromUserAccount: string;
    toUserAccount: string;
    fromTokenAccount: string;
    toTokenAccount: string;
    tokenAmount: number;
    mint: string;
};

export type AccountData = {
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: TokenBalanceChange[];
};

export type InnerInstruction = {
    accounts: string[];
    data: string;
    programId: string;
};

export type Instruction = {
    accounts: string[];
    data: string;
    programId: string;
    innerInstructions: InnerInstruction[];
};

export type NativeBalanceChange = {
    account: string;
    amount: string;
};

export type ProgramInfo = {
    source: string;
    account: string;
    programName: string;
    instructionName: string;
};

export type TokenSwap = {
    tokenInputs: TokenTransfer[];
    tokenOutputs: TokenTransfer[];
    tokenFees: TokenTransfer[];
    nativeFees: NativeTransfer[];
    programInfo: ProgramInfo;
};

export type Token = {
    mint: string;
    tokenStandard: string;
};

export type NFTEvent = {
    description: string;
    type: string;
    source: string;
    amount: number;
    fee: number;
    feePayer: string;
    signature: string;
    slot: number;
    timestamp: number;
    saleType: string;
    buyer: string;
    seller: string;
    staker: string;
    nfts: Token[];
};

export type SwapEvent = {
    nativeInput: NativeBalanceChange;
    nativeOutput: NativeBalanceChange;
    tokenInputs: TokenBalanceChange[];
    tokenOutputs: TokenBalanceChange[];
    tokenFees: TokenBalanceChange[];
    nativeFees: NativeBalanceChange[];
    innerSwaps: TokenSwap[];
};

export type CompressedNFTEvent = {
    type: string;
    treeId: string;
    assetId: string;
    leafIndex: number;
    instructionIndex: number;
    innerInstructionIndex: number;
    newLeafOwner: string;
    oldLeafOwner: string;
};

export type DistributeCompressionRewardsEvent = {
    amount: number;
};

export type SetAuthorityEvent = {
    account: string;
    from: string;
    to: string;
    instructionIndex: number;
    innerInstructionIndex: number;
};

export type EnhancedTransaction = {
    description: string;
    type: string;
    source: string;
    fee: number;
    feePayer: string;
    signature: string;
    slot: number;
    timestamp: number;
    nativeTransfers: NativeTransfer[];
    tokenTransfers: TokenTransfer[];
    accountData: AccountData[];
    transactionError: { error: string } | null;
    instructions: Instruction[];
    events: {
        nft?: NFTEvent;
        swap?: SwapEvent;
        compressed?: CompressedNFTEvent;
        distributeCompressionRewards?: DistributeCompressionRewardsEvent;
        setAuthority?: SetAuthorityEvent;
    };
};

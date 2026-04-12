type ComputeUnitPrice = "auto" | string;

export interface JupiterPriceV3Item {
    createdAt: string;
    liquidity: number;
    usdPrice: number;
    blockId: number | null;
    decimals: number;
    priceChange24h: number | null;
}

export interface JupiterToken {
    address: string;
    chainId: number;
    decimals: number;
    name: string;
    symbol: string;
    logoURI?: string;
    tags?: string[];
    extensions?: {
        coingeckoId?: string;
    };
}

export interface JupiterTokenV2 {
    id: string; // token pubkey address
    decimals: number;
    name: string;
    symbol: string;
    icon?: string | null;
    tags?: string[];
    extensions?: {
        coingeckoId?: string;
    };
}

export interface JupiterSwapStats {
    priceChange?: number | null;
    holderChange?: number | null;
    liquidityChange?: number | null;
    volumeChange?: number | null;
    buyVolume?: number | null;
    sellVolume?: number | null;
    buyOrganicVolume?: number | null;
    sellOrganicVolume?: number | null;
    numBuys?: number | null;
    numSells?: number | null;
    numTraders?: number | null;
    numOrganicBuyers?: number | null;
    numNetBuyers?: number | null;
}

export interface JupiterTokenAudit {
    isSus?: boolean | null;
    mintAuthorityDisabled?: boolean | null;
    freezeAuthorityDisabled?: boolean | null;
    topHoldersPercentage?: number | null;
    devBalancePercentage?: number | null;
    devMints?: number | null;
}

export interface JupiterFirstPool {
    id: string;
    createdAt: string;
}

export interface JupiterTokenMintInformation {
    id: string;
    name: string;
    symbol: string;
    icon?: string | null;
    decimals: number;

    // Token program info
    tokenProgram?: string;
    createdAt?: string;

    // Social links
    website?: string | null;
    twitter?: string | null;
    telegram?: string | null;
    discord?: string | null;
    instagram?: string | null;
    tiktok?: string | null;
    otherUrl?: string | null;

    // Developer info
    dev?: string | null;
    mintAuthority?: string | null;
    freezeAuthority?: string | null;
    issuer?: string | null;

    // Supply data
    circSupply?: number | null;
    totalSupply?: number | null;

    // Launchpad & graduation
    launchpad?: string | null;
    partnerConfig?: string | null;
    graduatedPool?: string | null;
    graduatedAt?: string | null;

    // Market data
    holderCount?: number | null;
    fdv?: number | null;
    mcap?: number | null;
    usdPrice?: number | null;
    priceBlockId?: number | null;
    liquidity?: number | null;
    fees?: number | null;

    // APY (Jupiter Lend)
    apy?: {
        jupEarn?: number;
    } | null;

    // Time-based stats
    stats5m?: JupiterSwapStats | null;
    stats1h?: JupiterSwapStats | null;
    stats6h?: JupiterSwapStats | null;
    stats24h?: JupiterSwapStats | null;
    stats7d?: JupiterSwapStats | null;
    stats30d?: JupiterSwapStats | null;

    // Pool info
    firstPool?: JupiterFirstPool | null;

    // Audit & verification
    audit?: JupiterTokenAudit | null;
    organicScore?: number | null;
    organicScoreLabel?: "high" | "medium" | "low" | null;
    isVerified?: boolean | null;
    tags?: string[] | null;

    // Timestamps
    updatedAt?: string;
}

export interface CreateOrderParams {
    inputMint: string;
    outputMint: string;
    maker: string;
    payer: string;
    params: {
        makingAmount: string;
        takingAmount: string;
        slippageBps?: string;
        expiredAt?: string;
        feeBps?: string;
    };
    computeUnitPrice?: string;
    feeAccount?: string;
    wrapAndUnwrapSol?: boolean;
}

export interface CreateOrderResponse {
    order: string;
    transaction: string;
    requestId: string;
}

export interface CancelOrderParams {
    maker: string;
    order: string;
    computeUnitPrice: ComputeUnitPrice;
}

export interface CancelOrderResponse {
    transaction: string;
    requestId: string;
}

export interface CancelOrdersParams {
    maker: string;
    order?: string[];
    computeUnitPrice: ComputeUnitPrice;
}

export interface CancelOrdersResponse {
    transactions: string[];
    requestId: string;
}

export interface ExecuteParams {
    requestId: string;
    signedTransaction: string;
}

export interface ExecuteResponse {
    status: string;
    signature: string;
    code: number;
}

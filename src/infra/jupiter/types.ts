type ComputeUnitPrice = "auto";

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
    id: string;
    decimals: number;
    name: string;
    symbol: string;
    icon?: string | null;
    tags?: string[];
    extensions?: {
        coingeckoId?: string;
    };
}

export interface JupiterTokenMintInformation {
    id: string;
    name: string;
    symbol: string;
    icon?: string | null;
    decimals: number;
    usdPrice?: number;
    fdv?: number;
    mcap?: number;
    liquidity?: number;
    circSupply?: number;
    totalSupply?: number;
    holderCount?: number;
    tags?: string[];
    website?: string;
    twitter?: string;
    telegram?: string;
    discord?: string;
    instagram?: string;
    tiktok?: string;
    otherUrl?: string;
    isVerified?: boolean;
    audit?: {
        mintAuthorityDisabled?: boolean;
        freezeAuthorityDisabled?: boolean;
        topHoldersPercentage?: number;
    };
    stats24h?: {
        priceChange?: number;
        volumeChange?: number;
        liquidityChange?: number;
        numBuys?: number;
        numSells?: number;
        holderChange?: number;
    };
    stats7d?: {
        priceChange?: number;
    };
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

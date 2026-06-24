export const mockOpenAIService = {
    createCompletion: jest.fn().mockImplementation(() => ({
        choices: [
            {
                message: { content: "This is a mocked AI response" },
                finish_reason: "stop"
            }
        ]
    })),
    createEmbedding: jest.fn().mockResolvedValue(new Array(1536).fill(0))
};

export const mockSolanaService = {
    getNetwork: jest.fn().mockReturnValue("mainnet-beta"),
    getBalance: jest.fn().mockResolvedValue(1.5),
    getTokenBalance: jest.fn().mockResolvedValue(100),
    getParsedTokenAccountsByOwner: jest.fn().mockResolvedValue([]),
    getTransactionHistory: jest.fn().mockResolvedValue([]),
    validatePublicKey: jest.fn().mockImplementation((addr: string) => /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr)),
    getParsedTransactions: jest.fn().mockResolvedValue([]),
    getTransactionStats: jest.fn().mockResolvedValue([]),
    getAssetsByOwner: jest.fn().mockResolvedValue({ items: [] }),
    getMintMetadata: jest.fn().mockResolvedValue(null)
};

export const mockEmailService = {
    sendEmail: jest.fn().mockResolvedValue({ id: "mock-email-id" }),
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true)
};

export const mockZaloService = {
    sendMessage: jest.fn().mockResolvedValue({ message_id: "mock-zalo-id" })
};

export const mockJupiterService = {
    createOrder: jest.fn().mockResolvedValue({ order: "mock-order-id", tx: "mock-tx" }),
    getTriggerOrders: jest.fn().mockResolvedValue([]),
    cancelOrder: jest.fn().mockResolvedValue({}),
    cancelOrders: jest.fn().mockResolvedValue({}),
    executeOrder: jest.fn().mockResolvedValue({ signature: "mock-sig" }),
    getTokenPrice: jest.fn().mockResolvedValue(1.0),
    searchToken: jest.fn().mockResolvedValue({ symbol: "MOCK", name: "Mock Token" })
};

export const mockCoinGeckoService = {
    getTrendingCoins: jest.fn().mockResolvedValue({ coins: [] }),
    getCoinsMarketData: jest.fn().mockResolvedValue([]),
    getCategories: jest.fn().mockResolvedValue([]),
    getSimplePrice: jest.fn().mockResolvedValue({}),
    searchCoins: jest.fn().mockResolvedValue({ coins: [] }),
    cacheManager: {
        del: jest.fn().mockResolvedValue(null),
        get: jest.fn().mockResolvedValue(null),
        set: jest.fn().mockResolvedValue(null)
    }
};

export const mockVectorStoreService = {
    upsert: jest.fn().mockResolvedValue(null),
    upsertMany: jest.fn().mockResolvedValue(null),
    search: jest.fn().mockResolvedValue([]),
    deleteByFilter: jest.fn().mockResolvedValue(0),
    isReady: true
};

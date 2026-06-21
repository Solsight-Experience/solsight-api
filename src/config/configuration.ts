export const TRADE_CHANNELS = {
    mainnet: "solsight:trade_events:mainnet",
    devnet: "solsight:trade_events:devnet"
} as const;

export const INDEXER_TRADE_CHANNELS = [TRADE_CHANNELS.mainnet, TRADE_CHANNELS.devnet] as const;

export type TradeChannels = (typeof TRADE_CHANNELS)[keyof typeof TRADE_CHANNELS];

const configuration = () => ({
    port: parseInt(process.env.PORT || "", 10) || 3000,
    ws_port: parseInt(process.env.WS_PORT || "", 10) || 3001,
    environment: process.env.NODE_ENV || "development",

    database: {
        type: "postgres",
        url: process.env.DATABASE_URL,
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "", 10) || 5432,
        username: process.env.DATABASE_USERNAME || "postgres",
        password: process.env.DATABASE_PASSWORD || "password",
        database: process.env.DATABASE_NAME || "flaxh_trade",
        synchronize: process.env.NODE_ENV === "development",
        logging: false // Tạm tắt log query DB
    },

    redis: {
        url: process.env.REDIS_URL || "redis://localhost:6379"
    },

    solana: {
        network: process.env.SOLANA_NETWORK || "mainnet-beta"
    },

    staking: {
        ifProgramId: process.env.IF_PROGRAM_ID || "4tsHWpfGh94M3gmDBYj96jquEpGbtyLYz4q87roAXbZU",
        ifAuthority: process.env.IF_AUTHORITY || "HJnpCRqahd2Zunhx1VyY9d9Hj7UyLSNWQEavybJC3MSa"
    },

    helius: {
        rpcUrl: process.env.HELIUS_RPC_URL,
        apiKey: process.env.HELIUS_API_KEY
    },

    jupiter: {
        apiUrl: process.env.JUPITER_API_URL ?? "https://api.jup.ag",
        apiKey: process.env.JUPITER_API_KEY
    },

    jito: {
        tipFloorUrl: process.env.JITO_TIP_FLOOR_URL ?? "https://bundles.jito.wtf/api/v1/bundles/tip_floor"
    },

    executor: {
        provider: process.env.EXECUTOR_PROVIDER || "jupiter"
    },

    solsightExecutor: {
        apiUrl: process.env.SOLSIGHT_EXECUTOR_API_URL ?? "http://localhost:8080",
        apiKey: process.env.SOLSIGHT_EXECUTOR_API_KEY
    },

    kora: {
        rpcUrl: process.env.KORA_RPC_URL,
        apiKey: process.env.KORA_API_KEY,
        hmacSecret: process.env.KORA_HMAC_SECRET
    },

    coingecko: {
        apiUrl: process.env.COINGECKO_API_URL || "https://api.coingecko.com/api/v3",
        apiKey: process.env.COINGECKO_API_KEY || ""
    },

    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        apiUrl: process.env.OPENAI_API_URL,
        model: process.env.OPENAI_MODEL || "gpt-4o",
        embeddingApiKey: process.env.EMBEDDING_API_KEY,
        embeddingApiUrl: process.env.EMBEDDING_API_URL,
        embeddingModel: process.env.EMBEDDING_MODEL
    },

    jwt: {
        secret: process.env.JWT_SECRET || "your-secret-key",
        expiresIn: process.env.JWT_EXPIRES_IN || "7d"
    },

    cors: {
        origin: process.env.CORS_ORIGIN?.split(",") || ["http://localhost:3000"],
        credentials: true
    },

    logging: {
        level: process.env.LOG_LEVEL || "info",
        format: process.env.LOG_FORMAT || "json"
    },

    api: {
        prefix: process.env.API_PREFIX || "api",
        version: process.env.API_VERSION || "v1"
    },

    zalo: {
        botToken: process.env.ZALO_BOT_TOKEN ?? ""
    },

    email: {
        resendApiKey: process.env.RESEND_API_KEY ?? "",
        fromAddress: process.env.EMAIL_FROM_ADDRESS ?? "onboarding@resend.dev",
        verifyBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3001"
    }
});

export type AppConfig = ReturnType<typeof configuration>;

export default configuration;

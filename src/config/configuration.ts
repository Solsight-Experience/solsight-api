export default () => ({
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

    helius: {
        rpcUrl: process.env.HELIUS_RPC_URL,
        apiKey: process.env.HELIUS_API_KEY
    },

    helius: {
        heliusRpcUrl: process.env.HELIUS_RPC_URL,
        heliusApiKey: process.env.HELIUS_API_KEY
    },

    jupiter: {
        apiUrl: process.env.JUPITER_API_URL,
        apiKey: process.env.JUPITER_API_KEY
    },

    coingecko: {
        apiUrl: process.env.COINGECKO_API_URL || "https://api.coingecko.com/api/v3",
        apiKey: process.env.COINGECKO_API_KEY || "",
        searchTokenId: process.env.COINGECKO_LIST_API || "https://api.coingecko.com/api/v3/coins/list?include_platform=true"
    },

    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        apiUrl: process.env.OPENAI_API_URL,
        model: process.env.OPENAI_MODEL || "gpt-4o"
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
        fromAddress: process.env.EMAIL_FROM_ADDRESS ?? "alerts@solsight.app",
        verifyBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000"
    }
});

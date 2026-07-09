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
        programId: process.env.STAKING_PROGRAM_ID || "BHaXES9ZvPVozojv3Z7ETV16vjBpWNQL59mDiwoPtNPG",
        // Wallet that ran `initialize` and owns the StakePoolConfig PDA. Already set up on
        // devnet (verified on-chain via getProgramAccounts) using the same admin wallet as
        // the old IF_AUTHORITY. Must be set explicitly for mainnet once initialized there.
        authority: process.env.STAKING_AUTHORITY || "HJnpCRqahd2Zunhx1VyY9d9Hj7UyLSNWQEavybJC3MSa",
        // Jito's official devnet SPL Stake Pool deployment. The old well-known address
        // SPoo1Ku8WFXoNDMHPsrGSTSG1Y47rzgn41SLUNakuHy is stuck on devnet at an outdated
        // v0.6.4 build and is no longer upgradable there (per Jito) — mainnet is unaffected
        // and keeps using SPoo1... (see modules/staking/config/pool-config.ts).
        devnetPool: {
            stakePool: process.env.STAKING_DEVNET_STAKE_POOL || "JitoY5pcAxWX6iyP2QdFwTznGb8A99PRCUCVVxB46WZ",
            lstMint: process.env.STAKING_DEVNET_LST_MINT || "J1tos8mqbhdGcF3pgj4PCKyVjzWSURcpLZU7pPGHxSYi",
            withdrawAuthority: process.env.STAKING_DEVNET_WITHDRAW_AUTHORITY || "8HPpFV5PFqGmDumjRTFw9BhsjrZYjJBDuHX2p6H5nBmd",
            reserveStake: process.env.STAKING_DEVNET_RESERVE_STAKE || "Dsd1zgN4XtxC6239vNznTNb6akTLNQeSBKoJqYjNps5e",
            managerFeeAccount: process.env.STAKING_DEVNET_MANAGER_FEE_ACCOUNT || "77MybzFEM9WbZLsGtoiX2WACJ4K5JbxU9HBKUVapb5KN",
            stakePoolProgram: process.env.STAKING_DEVNET_STAKE_POOL_PROGRAM || "DPoo15wWDqpPJJtS2MUZ49aRxqz5ZaaJCJP4z8bLuib"
        }
    },

    billing: {
        merchantWallet: process.env.MERCHANT_WALLET
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

    telegram: {
        botToken: process.env.TELEGRAM_BOT_TOKEN ?? ""
    },

    email: {
        resendApiKey: process.env.RESEND_API_KEY ?? "",
        fromAddress: process.env.EMAIL_FROM_ADDRESS ?? "onboarding@resend.dev",
        verifyBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3001"
    }
});

export type AppConfig = ReturnType<typeof configuration>;

export default configuration;

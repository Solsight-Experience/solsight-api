import * as Joi from "joi";

/**
 * Joi validates SHAPE only — required / type / format / enum.
 *
 * Single source of truth for DEFAULT values is `configuration.ts`. See
 * AGENTS.md → "Configuration & defaults" before adding `||` / `??` fallbacks
 * anywhere else.
 *
 * Required vs optional:
 *  - `.required()`     — secret / API key / per-env value with no safe default
 *  - `.optional()`     — has a default in `configuration.ts`, or genuinely optional
 */
export const validationSchema = Joi.object({
    NODE_ENV: Joi.string().valid("development", "production", "test").optional(),
    PORT: Joi.number().optional(),
    WS_PORT: Joi.number().optional(),

    // Database — credentials required when DATABASE_URL is not provided
    DATABASE_URL: Joi.string().uri().optional(),
    DATABASE_HOST: Joi.string().optional(),
    DATABASE_PORT: Joi.number().optional(),
    DATABASE_USERNAME: Joi.when("DATABASE_URL", {
        is: Joi.exist(),
        then: Joi.string().optional(),
        otherwise: Joi.string().required()
    }),
    DATABASE_PASSWORD: Joi.when("DATABASE_URL", {
        is: Joi.exist(),
        then: Joi.string().optional(),
        otherwise: Joi.string().required()
    }),
    DATABASE_NAME: Joi.when("DATABASE_URL", {
        is: Joi.exist(),
        then: Joi.string().optional(),
        otherwise: Joi.string().required()
    }),

    // Redis
    REDIS_URL: Joi.string()
        .uri({ scheme: ["redis", "rediss"] })
        .optional(),

    // Solana
    SOLANA_RPC_URL: Joi.string().uri().optional(),
    SOLANA_NETWORK: Joi.string().valid("mainnet-beta", "devnet", "testnet").optional(),

    // Helius — required: app expects an authenticated RPC endpoint
    HELIUS_RPC_URL: Joi.string().uri().required(),
    HELIUS_API_KEY: Joi.string().required(),

    // JWT
    JWT_SECRET: Joi.string().required(),
    JWT_EXPIRES_IN: Joi.string().optional(),

    // API
    API_PREFIX: Joi.string().optional(),
    API_VERSION: Joi.string().optional(),

    // Logging
    LOG_LEVEL: Joi.string().valid("error", "warn", "info", "debug").optional(),
    LOG_FORMAT: Joi.string().valid("json", "simple").optional(),

    // CORS — comma-separated list, parsed in configuration.ts
    CORS_ORIGIN: Joi.string().optional(),

    // Jupiter — public URL has a default; key is required (sent on every request)
    JUPITER_API_URL: Joi.string().uri().optional(),
    JUPITER_API_KEY: Joi.string().required(),

    // CoinGecko
    COINGECKO_API_URL: Joi.string().uri().optional(),
    COINGECKO_API_KEY: Joi.string().required(),
    COINGECKO_LIST_API: Joi.string().uri().optional(),

    // OpenAI (default AI provider)
    OPENAI_API_KEY: Joi.string().required(),
    OPENAI_API_URL: Joi.string().uri().optional(),
    OPENAI_MODEL: Joi.string().optional(),

    // Zalo OA Bot — non-core (alerts only)
    ZALO_BOT_TOKEN: Joi.string().allow("").optional(),

    // Email (Resend) — non-core (transactional email)
    RESEND_API_KEY: Joi.string().allow("").optional(),
    EMAIL_FROM_ADDRESS: Joi.string().optional(),
    APP_BASE_URL: Joi.string().uri().optional()
});

export default () => ({
  port: parseInt(process.env.PORT || '', 10) || 3000,
  ws_port: parseInt(process.env.WS_PORT || '', 10) || 3001,
  environment: process.env.NODE_ENV || 'development',

  database: {
    type: 'postgres',
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '', 10) || 5432,
    username: process.env.DATABASE_USERNAME || 'postgres',
    password: process.env.DATABASE_PASSWORD || 'password',
    database: process.env.DATABASE_NAME || 'flaxh_trade',
    synchronize: process.env.NODE_ENV === 'development',
    logging: false, // Tạm tắt log query DB
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  solana: {
    rpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    heliusRpcUrl: process.env.HELIUS_RPC_URL,
    heliusApiKey: process.env.HELIUS_API_KEY,
    network: process.env.SOLANA_NETWORK || 'mainnet-beta',
    commitment: 'confirmed',
    jupiterApi: {
      searchToken:
        process.env.JUPITER_TOKEN_SEARCH_API ||
        'https://lite-api.jup.ag/tokens/v2/search?query=',
    },
    coingeckoApi: {
      searchTokenId:
        process.env.COINGECKO_LIST_API ||
        'https://api.coingecko.com/api/v3/coins/list',
    },
  },

  jupiter: {
    apiUrl: process.env.JUPITER_API_URL || 'https://quote-api.jup.ag/v6',
    priceApiUrl: process.env.JUPITER_PRICE_API_URL || 'https://price.jup.ag/v4',
    triggerApiUrl: process.env.JUPITER_TRIGGER_API_URL || 'https://api.jup.ag/trigger/v1',
    apiKey: process.env.JUPITER_API_KEY || '',
  },

  coingecko: {
    apiUrl: process.env.COINGECKO_API_URL || 'https://api.coingecko.com/api/v3',
    apiKey: process.env.COINGECKO_API_KEY || '',
  },

  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    apiUrl: process.env.LLM_API_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o',
    timeoutMs: parseInt(process.env.LLM_TIMEOUT_MS || '', 10) || 30000,
    
  openai: {
    apiKey: process.env.GEMINI_API_KEY || '',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite',
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
  },

  api: {
    prefix: process.env.API_PREFIX || 'api',
    version: process.env.API_VERSION || 'v1',
  },
});

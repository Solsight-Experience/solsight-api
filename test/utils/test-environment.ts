import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { AppModule } from "../../src/app.module";
import { DataSource } from "typeorm";
import * as cookieParser from "cookie-parser";
import { OpenAIService } from "../../src/infra/openai/openai.service";
import { SolanaService } from "../../src/infra/solana/solana.service";
import { EmailSenderService } from "../../src/modules/email/services/sender-service/email-sender.service";
import { ZaloApiService } from "../../src/modules/zalo/services/zalo-api.service";
import { JupiterService } from "../../src/infra/jupiter/jupiter.service";
import { TokenSeederService } from "../../src/modules/tokens/services/token-seeder.service";
import { CoinGeckoService } from "../../src/infra/coingecko/coingecko.service";
import { VectorStoreService } from "../../src/infra/vectorstore/vectorstore.service";
import { HeliusService } from "../../src/infra/solana/helius.service";
import { TokenSocketService } from "../../src/modules/tokens/services/socket/token.socket.service";
import {
    mockOpenAIService,
    mockSolanaService,
    mockEmailService,
    mockZaloService,
    mockJupiterService,
    mockCoinGeckoService,
    mockVectorStoreService
} from "./mock-services";

export class TestEnvironment {
    private app: INestApplication;

    async init() {
        // Setup common Env Vars fallback if not set by Global Setup or CI
        process.env.DATABASE_HOST = process.env.DATABASE_HOST || "localhost";
        process.env.DATABASE_PORT = process.env.DATABASE_PORT || "5432";
        process.env.DATABASE_USERNAME = process.env.DATABASE_USERNAME || "test_user";
        process.env.DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || "test_pass";
        process.env.DATABASE_NAME = process.env.DATABASE_NAME || "test_db";
        process.env.REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
        process.env.MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/test";
        process.env.NODE_ENV = "test";
        process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
        process.env.SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "http://localhost:8899";
        process.env.HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "http://localhost:8899";
        process.env.HELIUS_API_KEY = process.env.HELIUS_API_KEY || "mock-helius-key";
        process.env.JUPITER_API_KEY = process.env.JUPITER_API_KEY || "mock-jupiter-key";
        process.env.COINGECKO_API_KEY = process.env.COINGECKO_API_KEY || "mock-coingecko-key";
        process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "mock-openai-key";

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule]
        })
            .overrideProvider(OpenAIService)
            .useValue(mockOpenAIService)
            .overrideProvider(SolanaService)
            .useValue(mockSolanaService)
            .overrideProvider(EmailSenderService)
            .useValue(mockEmailService)
            .overrideProvider(ZaloApiService)
            .useValue(mockZaloService)
            .overrideProvider(JupiterService)
            .useValue(mockJupiterService)
            .overrideProvider(CoinGeckoService)
            .useValue(mockCoinGeckoService)
            .overrideProvider(VectorStoreService)
            .useValue(mockVectorStoreService)
            .overrideProvider(HeliusService)
            .useValue(mockSolanaService)
            .overrideProvider(TokenSeederService)
            .useValue({ onModuleInit: jest.fn() })
            .overrideProvider(TokenSocketService)
            .useValue({ onModuleInit: jest.fn() })
            .compile();

        this.app = moduleFixture.createNestApplication();
        this.app.use(cookieParser());
        this.app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
        this.app.setGlobalPrefix("api");

        this.app.enableShutdownHooks();
        await this.app.init();

        const dataSource = this.app.get(DataSource);
        if (dataSource.isInitialized) {
            await dataSource.query("CREATE EXTENSION IF NOT EXISTS vector;");
            await dataSource.synchronize();
        }

        return this.app;
    }

    async close() {
        if (this.app) {
            try {
                const schedulerRegistry = this.app.get(SchedulerRegistry);

                // Stop all Cron Jobs
                const jobs = schedulerRegistry.getCronJobs();
                jobs.forEach((job) => job.stop());

                // Stop all Intervals
                const intervals = schedulerRegistry.getIntervals();
                intervals.forEach((interval) => schedulerRegistry.deleteInterval(interval));

                // Stop all Timeouts
                const timeouts = schedulerRegistry.getTimeouts();
                timeouts.forEach((timeout) => schedulerRegistry.deleteTimeout(timeout));
            } catch (e) {
                // SchedulerRegistry might not be available or module not imported
            }

            const dataSource = this.app.get(DataSource);
            if (dataSource.isInitialized) {
                await dataSource.destroy();
            }
            await this.app.close();
        }
    }

    getApp() {
        return this.app;
    }
}

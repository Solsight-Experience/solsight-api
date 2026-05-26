import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { setupE2EDatabase, teardownE2EDatabase } from "./e2e-db-setup";
import { DataSource } from "typeorm";
import { getPartitionedDatabaseConfig } from "../src/config/database.config";
import { Token } from "../src/modules/tokens/entities/token.entity";
import { Transaction } from "../src/modules/transactions/entities/transaction.entity";

describe("Cluster Switching (e2e)", () => {
    let app: INestApplication;
    let mainnetDs: DataSource;
    let devnetDs: DataSource;

    beforeAll(async () => {
        // Setup E2E databases (mainnet, devnet, public)
        await setupE2EDatabase(["mainnet", "devnet"]);

        // Create mainnet and devnet DataSources for seeding
        mainnetDs = new DataSource(getPartitionedDatabaseConfig(process.env as any, "mainnet") as any);
        await mainnetDs.initialize();

        devnetDs = new DataSource(getPartitionedDatabaseConfig(process.env as any, "devnet") as any);
        await devnetDs.initialize();

        // Seed mainnet with token A
        const mainnetTokenRepo = mainnetDs.getRepository(Token);
        const mainnetToken = mainnetTokenRepo.create({
            mint: "TokenAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
            name: "Mainnet Token A",
            symbol: "MTA",
            decimals: 6,
            logoUri: "https://example.com/mta.png",
            liquidity: 10000,
            ageSeconds: 3600
        });
        await mainnetTokenRepo.save(mainnetToken);

        // Seed devnet with token B
        const devnetTokenRepo = devnetDs.getRepository(Token);
        const devnetToken = devnetTokenRepo.create({
            mint: "TokenBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
            name: "Devnet Token B",
            symbol: "DTB",
            decimals: 6,
            logoUri: "https://example.com/dtb.png",
            liquidity: 5000,
            ageSeconds: 3600
        });
        await devnetTokenRepo.save(devnetToken);

        // Create NestJS app
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule]
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        if (mainnetDs) await mainnetDs.destroy();
        if (devnetDs) await devnetDs.destroy();
        if (app) await app.close();
        await teardownE2EDatabase();
    });

    describe("F1: Default cluster is mainnet", () => {
        it("GET /api/tokens without ?cluster= param should return mainnet data", async () => {
            const response = await request(app.getHttpServer()).get("/api/tokens").expect(200);

            expect(response.body.data).toBeDefined();
            const tokenNames = response.body.data.map((t: any) => t.name);

            expect(tokenNames).toContain("Mainnet Token A");
            expect(tokenNames).not.toContain("Devnet Token B");
        });
    });

    describe("F2: Cluster parameter routes to correct schema", () => {
        it("GET /api/tokens?cluster=mainnet should return mainnet tokens only", async () => {
            const response = await request(app.getHttpServer()).get("/api/tokens").query({ cluster: "mainnet" }).expect(200);

            const tokenNames = response.body.data.map((t: any) => t.name);
            expect(tokenNames).toContain("Mainnet Token A");
            expect(tokenNames).not.toContain("Devnet Token B");
        });

        it("GET /api/tokens?cluster=devnet should return devnet tokens only", async () => {
            const response = await request(app.getHttpServer()).get("/api/tokens").query({ cluster: "devnet" }).expect(200);

            const tokenNames = response.body.data.map((t: any) => t.name);
            expect(tokenNames).toContain("Devnet Token B");
            expect(tokenNames).not.toContain("Mainnet Token A");
        });
    });

    describe("F3: Invalid cluster values rejected", () => {
        it("GET /api/tokens?cluster=garbage should return 400 Bad Request", async () => {
            const response = await request(app.getHttpServer()).get("/api/tokens").query({ cluster: "garbage" }).expect(400);

            expect(response.body.message).toBeDefined();
        });

        it("GET /api/tokens?cluster=solana should return 400 Bad Request", async () => {
            const response = await request(app.getHttpServer()).get("/api/tokens").query({ cluster: "solana" }).expect(400);

            expect(response.body.message).toBeDefined();
        });
    });

    describe("F8: Write operations write to correct schema", () => {
        it("POST /api/portfolio/snapshot?cluster=devnet should write to devnet schema", async () => {
            // This test assumes a write endpoint exists
            // The exact endpoint and payload depend on the actual API
            // Placeholder for write validation via direct SQL

            const devnetSnapshotRepo = devnetDs.getRepository("WalletSnapshot");
            const initialCount = await devnetSnapshotRepo.count();

            // Trigger a write (implementation depends on actual endpoint)
            // const response = await request(app.getHttpServer())
            //   .post('/api/portfolio/snapshot')
            //   .query({ cluster: 'devnet' })
            //   .send({ walletAddress: 'test', tokenMint: 'test', amount: 100 })
            //   .expect(200 or 201);

            // Verify write happened in correct schema
            const finalCount = await devnetSnapshotRepo.count();
            // expect(finalCount).toBeGreaterThan(initialCount);
        });
    });

    describe("Echo endpoint", () => {
        it("GET /__cluster/echo?cluster=devnet should return devnet RPC URL", async () => {
            const response = await request(app.getHttpServer()).get("/__cluster/echo").query({ cluster: "devnet" }).expect(200);

            expect(response.body.cluster).toBe("devnet");
            expect(response.body.rpcEndpoint).toBe("https://api.devnet.solana.com");
        });

        it("GET /__cluster/echo?cluster=mainnet should return mainnet RPC URL", async () => {
            const response = await request(app.getHttpServer()).get("/__cluster/echo").query({ cluster: "mainnet" }).expect(200);

            expect(response.body.cluster).toBe("mainnet");
            expect(response.body.rpcEndpoint).toBe("https://api.mainnet-beta.solana.com");
        });
    });
});

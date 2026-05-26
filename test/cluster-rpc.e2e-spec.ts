import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../src/app.module";
import { setupE2EDatabase, teardownE2EDatabase } from "./e2e-db-setup";

describe("Cluster-aware RPC (e2e)", () => {
    let app: INestApplication;

    beforeAll(async () => {
        await setupE2EDatabase(["mainnet", "devnet"]);

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule]
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        if (app) await app.close();
        await teardownE2EDatabase();
    });

    describe("F9: Cluster-aware RPC connections", () => {
        it("/__cluster/echo?cluster=mainnet should return mainnet RPC endpoint", async () => {
            const response = await request(app.getHttpServer()).get("/__cluster/echo").query({ cluster: "mainnet" }).expect(200);

            expect(response.body.cluster).toBe("mainnet");
            expect(response.body.rpcEndpoint).toBe("https://api.mainnet-beta.solana.com");
        });

        it("/__cluster/echo?cluster=devnet should return devnet RPC endpoint", async () => {
            const response = await request(app.getHttpServer()).get("/__cluster/echo").query({ cluster: "devnet" }).expect(200);

            expect(response.body.cluster).toBe("devnet");
            expect(response.body.rpcEndpoint).toBe("https://api.devnet.solana.com");
        });

        it("/__cluster/echo without cluster param should default to mainnet RPC", async () => {
            const response = await request(app.getHttpServer()).get("/__cluster/echo").expect(200);

            expect(response.body.cluster).toBe("mainnet");
            expect(response.body.rpcEndpoint).toBe("https://api.mainnet-beta.solana.com");
        });
    });
});

import * as request from "supertest";
import { TestEnvironment } from "./utils/test-environment";
import { INestApplication } from "@nestjs/common";
import { Keypair } from "@solana/web3.js";

describe("PortfolioController (e2e)", () => {
    let app: INestApplication;
    const env = new TestEnvironment();
    let authToken: string;
    const mockPublicKey = Keypair.generate().publicKey.toBase58();

    beforeAll(async () => {
        app = await env.init();

        // 1. Register & Login
        const testUser = {
            email: `portfolio-test-${Math.random().toString(36).substring(7)}@example.com`,
            password: "Password123!"
        };

        const regRes = await request(app.getHttpServer()).post("/api/auth/register").send(testUser).expect(201);
        const userId = regRes.body.user.id;

        const loginRes = await request(app.getHttpServer()).post("/api/auth/login").send(testUser).expect(201);
        const cookies = loginRes.get("Set-Cookie") as string[];
        authToken = cookies[0].split(";")[0];

        // 2. Link a wallet to ensure portfolio has data
        await request(app.getHttpServer())
            .post(`/api/wallets/user/${userId}`)
            .set("Cookie", authToken)
            .send({
                name: "Main Wallet",
                address: mockPublicKey
            })
            .expect(201);
    }, 60000);

    afterAll(async () => {
        await env.close();
    }, 60000);

    it("/portfolio/overview (GET)", async () => {
        const response = await request(app.getHttpServer()).get("/api/portfolio/overview").set("Cookie", authToken).query({ time_frame: "24h" }).expect(200);

        expect(response.body.total_balance_usd).toBeDefined();
    }, 30000);

    it("/portfolio/performance (GET)", async () => {
        const response = await request(app.getHttpServer()).get("/api/portfolio/performance").set("Cookie", authToken).query({ time_frame: "7d" }).expect(200);

        expect(response.body).toBeDefined();
    }, 30000);

    it("/portfolio/activities (GET)", async () => {
        const response = await request(app.getHttpServer()).get("/api/portfolio/activities").set("Cookie", authToken).query({ limit: 10 }).expect(200);

        expect(Array.isArray(response.body.activities)).toBe(true);
    });

    it("/portfolio/overview (GET) - Negative: Unauthorized", async () => {
        await request(app.getHttpServer()).get("/api/portfolio/overview").expect(401);
    });
});

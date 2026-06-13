import * as request from "supertest";
import { TestEnvironment } from "./utils/test-environment";
import { INestApplication } from "@nestjs/common";
import { Keypair } from "@solana/web3.js";

describe("WalletsController (e2e)", () => {
    let app: INestApplication;
    const env = new TestEnvironment();
    let userId: string;
    let authToken: string;

    beforeAll(async () => {
        app = await env.init();

        // Create a user and login to get auth token and userId
        const testUser = {
            email: `test-${Math.random().toString(36).substring(7)}@example.com`,
            password: "Password123!"
        };

        const regRes = await request(app.getHttpServer()).post("/api/auth/register").send(testUser);

        userId = regRes.body.user.id;
        const cookies = regRes.get("Set-Cookie") as string[];
        authToken = cookies[0].split(";")[0];
    }, 60000);

    afterAll(async () => {
        await env.close();
    }, 60000);

    const mockPublicKey = Keypair.generate().publicKey.toBase58();

    it("/wallets/user/:userId (POST)", async () => {
        const response = await request(app.getHttpServer())
            .post(`/api/wallets/user/${userId}`)
            .set("Cookie", authToken)
            .send({
                name: "Test Wallet",
                address: mockPublicKey
            })
            .expect(201);

        expect(response.body.address).toBe(mockPublicKey);
        expect(response.body.userId).toBe(userId);
    }, 30000);

    it("/wallets/user/:userId (POST) - Negative: Invalid Solana address", async () => {
        return request(app.getHttpServer())
            .post(`/api/wallets/user/${userId}`)
            .set("Cookie", authToken)
            .send({
                name: "Invalid Wallet",
                address: "invalid-address-123"
            })
            .expect(400);
    });

    it("/wallets/user/:userId (POST) - Negative: Duplicate wallet", async () => {
        return request(app.getHttpServer())
            .post(`/api/wallets/user/${userId}`)
            .set("Cookie", authToken)
            .send({
                name: "Test Wallet",
                address: mockPublicKey
            })
            .expect(409);
    });

    it("/wallets/user/:userId (GET)", async () => {
        const response = await request(app.getHttpServer()).get(`/api/wallets/user/${userId}`).set("Cookie", authToken).expect(200);

        expect(Array.isArray(response.body)).toBe(true);
        expect(response.body.length).toBeGreaterThan(0);
        expect(response.body[0].address).toBe(mockPublicKey);
    });

    it("/wallets/:id/update-balance (POST)", async () => {
        // Get wallet id first
        const walletsRes = await request(app.getHttpServer()).get(`/api/wallets/user/${userId}`).set("Cookie", authToken);
        const walletId = walletsRes.body[0].id;

        const response = await request(app.getHttpServer()).post(`/api/wallets/${walletId}/update-balance`).set("Cookie", authToken).expect(201);

        expect(response.body.balance).toBeDefined();
    });

    it("/wallets/:id (GET) - Negative: Not Found", async () => {
        const nonExistentId = "00000000-0000-0000-0000-000000000000";
        return request(app.getHttpServer()).get(`/api/wallets/${nonExistentId}`).set("Cookie", authToken).expect(404);
    });
});

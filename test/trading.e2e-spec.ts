import * as request from "supertest";
import { TestEnvironment } from "./utils/test-environment";
import { INestApplication } from "@nestjs/common";

describe("LimitOrderController (e2e)", () => {
    let app: INestApplication;
    const env = new TestEnvironment();
    let authToken: string;

    beforeAll(async () => {
        app = await env.init();

        // Login
        const testUser = {
            email: `test-${Math.random().toString(36).substring(7)}@example.com`,
            password: "Password123!"
        };

        await request(app.getHttpServer()).post("/api/auth/register").send(testUser);

        const loginRes = await request(app.getHttpServer()).post("/api/auth/login").send(testUser);

        const cookies = loginRes.get("Set-Cookie") as string[];
        authToken = cookies[0].split(";")[0];
    }, 60000);

    afterAll(async () => {
        await env.close();
    }, 60000);

    const mockOrderData = {
        inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
        outputMint: "So11111111111111111111111111111111111111112", // SOL
        maker: "5o9N7n8X3G8y9Y7P9A8o9N7n8X3G8y9Y7P9A8o9N7n8",
        payer: "5o9N7n8X3G8y9Y7P9A8o9N7n8X3G8y9Y7P9A8o9N7n8",
        params: {
            makingAmount: "1000000",
            takingAmount: "2000000"
        }
    };

    it("/limit-orders/create (POST)", async () => {
        const response = await request(app.getHttpServer()).post("/api/limit-orders/create").set("Cookie", authToken).send(mockOrderData).expect(201);

        expect(response.body).toBeDefined();
    });

    it("/limit-orders (GET)", async () => {
        const response = await request(app.getHttpServer())
            .get("/api/limit-orders")
            .query({ user: mockOrderData.maker, orderStatus: "active" })
            .set("Cookie", authToken)
            .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
    });
});

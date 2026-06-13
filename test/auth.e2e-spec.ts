import * as request from "supertest";
import { TestEnvironment } from "./utils/test-environment";
import { INestApplication } from "@nestjs/common";

describe("AuthController (e2e)", () => {
    let app: INestApplication;
    const env = new TestEnvironment();

    beforeAll(async () => {
        app = await env.init();
    }, 60000); // Increase timeout for container startup

    afterAll(async () => {
        await env.close();
    }, 60000);

    const testUser = {
        email: `test-${Math.random().toString(36).substring(7)}@example.com`,
        password: "Password123!"
    };

    it("/auth/register (POST)", async () => {
        const response = await request(app.getHttpServer()).post("/api/auth/register").send(testUser).expect(201);

        expect(response.body.user).toBeDefined();
        expect(response.body.user.email).toBe(testUser.email.toLowerCase());
        expect(response.get("Set-Cookie")).toBeDefined();
    });

    it("/auth/login (POST) - Negative: Wrong password", async () => {
        return request(app.getHttpServer())
            .post("/api/auth/login")
            .send({
                email: testUser.email,
                password: "WrongPassword!"
            })
            .expect(401);
    });

    it("/auth/register (POST) - Negative: Duplicate email", async () => {
        return request(app.getHttpServer()).post("/api/auth/register").send(testUser).expect(409);
    });

    it("/auth/login (POST)", async () => {
        const response = await request(app.getHttpServer()).post("/api/auth/login").send(testUser).expect(201);

        expect(response.body.user).toBeDefined();
        expect(response.body.user.email).toBe(testUser.email.toLowerCase());
        const cookies = response.get("Set-Cookie") as string[];
        expect(cookies).toBeDefined();
        expect(cookies[0]).toContain("auth_token");
    });

    it("/auth/logout (POST)", async () => {
        const response = await request(app.getHttpServer()).post("/api/auth/logout").expect(201);

        expect(response.body.message).toBe("Logged out successfully");
        // Cookie should be cleared
        const cookies = response.get("Set-Cookie") as string[];
        expect(cookies).toBeDefined();
        expect(cookies[0]).toContain("auth_token=;");
    });
});

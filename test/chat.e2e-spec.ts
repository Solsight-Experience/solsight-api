import * as request from "supertest";
import { randomUUID } from "crypto";
import { TestEnvironment } from "./utils/test-environment";
import { INestApplication } from "@nestjs/common";

describe("ChatController (e2e)", () => {
    let app: INestApplication;
    const env = new TestEnvironment();
    let authToken: string;
    let sessionId: string;

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
        sessionId = randomUUID();
    }, 60000);

    afterAll(async () => {
        await env.close();
    }, 60000);

    it("/chat/message (POST)", async () => {
        const response = await request(app.getHttpServer())
            .post("/api/chat/message")
            .set("Cookie", authToken)
            .send({
                message: "How is the SOL price?",
                sessionId: sessionId
            })
            .expect(201);

        expect(response.body.content).toBe("This is a mocked AI response");
        expect(response.body.type).toBe("text");
    });

    it("/chat/sessions/:sessionId/messages (GET)", async () => {
        const response = await request(app.getHttpServer()).get(`/api/chat/sessions/${sessionId}/messages`).set("Cookie", authToken).expect(200);

        expect(response.body.messages).toBeDefined();
        expect(Array.isArray(response.body.messages)).toBe(true);
        expect(response.body.messages.length).toBeGreaterThanOrEqual(2);
    });

    it("/chat/message (POST) - Negative: Empty message", async () => {
        return request(app.getHttpServer())
            .post("/api/chat/message")
            .set("Cookie", authToken)
            .send({
                message: "",
                sessionId: sessionId
            })
            .expect(400);
    });

    it("/chat/message (POST) - Negative: Unauthorized", async () => {
        return request(app.getHttpServer())
            .post("/api/chat/message")
            .send({
                message: "Hello",
                sessionId: sessionId
            })
            .expect(401);
    });
});

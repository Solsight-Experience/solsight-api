import * as request from "supertest";
import { TestEnvironment } from "./utils/test-environment";
import { INestApplication } from "@nestjs/common";

describe("DiscoveryController (e2e)", () => {
    let app: INestApplication;
    const env = new TestEnvironment();

    beforeAll(async () => {
        app = await env.init();
    }, 60000);

    afterAll(async () => {
        await env.close();
    }, 60000);

    it("/discovery/trending (GET)", async () => {
        const response = await request(app.getHttpServer()).get("/api/discovery/trending").query({ limit: 5 }).expect(200);

        expect(Array.isArray(response.body.tokens)).toBe(true);
    });

    it("/discovery/new-listings (GET)", async () => {
        const response = await request(app.getHttpServer()).get("/api/discovery/new-listings").query({ limit: 5 }).expect(200);

        expect(Array.isArray(response.body.tokens)).toBe(true);
    });

    it("/discovery/categories (GET)", async () => {
        const response = await request(app.getHttpServer()).get("/api/discovery/categories").expect(200);

        expect(Array.isArray(response.body.data)).toBe(true);
    });

    it("/discovery/categories/:slug (GET) - Negative: Invalid slug", async () => {
        await request(app.getHttpServer()).get("/api/discovery/categories/non-existent-category").expect(404);
    });
});

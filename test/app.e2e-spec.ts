import { INestApplication } from "@nestjs/common";
import { TestEnvironment } from "./utils/test-environment";

describe("App (e2e)", () => {
    let app: INestApplication;
    const env = new TestEnvironment();

    beforeAll(async () => {
        app = await env.init();
    }, 60000);

    afterAll(async () => {
        await env.close();
    }, 60000);

    it("should be defined", () => {
        expect(app).toBeDefined();
    });
});

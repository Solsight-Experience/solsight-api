import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import { AppModule } from "../src/app.module";
import { setupE2EDatabase, teardownE2EDatabase } from "./e2e-db-setup";
import { DataSource } from "typeorm";
import { getPartitionedDatabaseConfig } from "../src/config/database.config";
import { Token } from "../src/modules/tokens/entities/token.entity";
import * as io from "socket.io-client";

describe("Cluster-aware WebSocket (e2e)", () => {
    let app: INestApplication;
    let mainnetDs: DataSource;
    let devnetDs: DataSource;
    let socket: any;

    beforeAll(async () => {
        await setupE2EDatabase(["mainnet", "devnet"]);

        mainnetDs = new DataSource(getPartitionedDatabaseConfig(process.env as any, "mainnet") as any);
        await mainnetDs.initialize();

        devnetDs = new DataSource(getPartitionedDatabaseConfig(process.env as any, "devnet") as any);
        await devnetDs.initialize();

        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule]
        }).compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        if (socket) socket.disconnect();
        if (mainnetDs) await mainnetDs.destroy();
        if (devnetDs) await devnetDs.destroy();
        if (app) await app.close();
        await teardownE2EDatabase();
    });

    describe("F12: WS cluster handshake validation", () => {
        it("WS connection with auth.cluster=devnet should establish successfully", async (done) => {
            const port = (app.getHttpServer().address() as any).port;
            socket = io.connect(`http://localhost:${port}`, {
                auth: {
                    cluster: "devnet"
                }
            });

            socket.on("connect", () => {
                expect(socket.connected).toBe(true);
                done();
            });

            socket.on("connect_error", (error: any) => {
                done(new Error(`Connection failed: ${error.message}`));
            });
        });

        it("WS connection with invalid cluster should reject", async (done) => {
            const port = (app.getHttpServer().address() as any).port;
            const invalidSocket = io.connect(`http://localhost:${port}`, {
                auth: {
                    cluster: "invalid-cluster"
                }
            });

            invalidSocket.on("connect_error", (error: any) => {
                expect(error).toBeDefined();
                invalidSocket.disconnect();
                done();
            });

            invalidSocket.on("connect", () => {
                invalidSocket.disconnect();
                done(new Error("Should not connect with invalid cluster"));
            });
        });

        it("WS connection with query.cluster=mainnet should establish successfully", async (done) => {
            const port = (app.getHttpServer().address() as any).port;
            const querySocket = io.connect(`http://localhost:${port}`, {
                query: {
                    cluster: "mainnet"
                }
            });

            querySocket.on("connect", () => {
                expect(querySocket.connected).toBe(true);
                querySocket.disconnect();
                done();
            });

            querySocket.on("connect_error", (error: any) => {
                querySocket.disconnect();
                done(new Error(`Connection failed: ${error.message}`));
            });
        });
    });
});

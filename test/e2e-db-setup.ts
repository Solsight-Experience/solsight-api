import { DataSource } from "typeorm";
import { ENTITIES } from "../src/database/entity-registry";

async function setupE2EDatabase(): Promise<void> {
    const baseConfig = {
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "5432", 10),
        username: process.env.DATABASE_USERNAME || "postgres",
        password: process.env.DATABASE_PASSWORD || "password",
        database: process.env.DATABASE_NAME || "flaxh_trade_e2e"
    };

    const adminDs = new DataSource({
        type: "postgres",
        ...baseConfig,
        synchronize: false,
        logging: false
    });

    await adminDs.initialize();
    await adminDs.query("DROP SCHEMA IF EXISTS public CASCADE");
    await adminDs.query("CREATE SCHEMA public");
    await adminDs.destroy();

    const ds = new DataSource({
        type: "postgres",
        ...baseConfig,
        entities: ENTITIES as any,
        synchronize: true,
        logging: false
    });

    await ds.initialize();
    await ds.destroy();
}

async function teardownE2EDatabase(): Promise<void> {
    const baseConfig = {
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "5432", 10),
        username: process.env.DATABASE_USERNAME || "postgres",
        password: process.env.DATABASE_PASSWORD || "password",
        database: process.env.DATABASE_NAME || "flaxh_trade_e2e"
    };

    const adminDs = new DataSource({
        type: "postgres",
        ...baseConfig,
        synchronize: false,
        logging: false
    });

    await adminDs.initialize();
    await adminDs.query("DROP SCHEMA IF EXISTS public CASCADE");
    await adminDs.query("CREATE SCHEMA public");
    await adminDs.destroy();
}

export { setupE2EDatabase, teardownE2EDatabase };

import { INestApplication } from "@nestjs/common";
import { DataSource } from "typeorm";
import { getDatabaseConfig } from "../src/config/database.config";
import { PARTITIONED_ENTITIES, SHARED_ENTITIES } from "../src/database/entity-registry";
import { Cluster } from "../src/common/cluster/cluster.types";

async function setupE2EDatabase(clusters: Cluster[] = ["mainnet", "devnet"]): Promise<void> {
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

    for (const cluster of clusters) {
        await adminDs.query(`DROP SCHEMA IF EXISTS "${cluster}" CASCADE`);
        await adminDs.query(`CREATE SCHEMA "${cluster}"`);
    }

    await adminDs.query("DROP SCHEMA IF EXISTS public CASCADE");
    await adminDs.query("CREATE SCHEMA public");

    await adminDs.destroy();

    for (const cluster of clusters) {
        const dsOptions = {
            type: "postgres" as const,
            ...baseConfig,
            schema: cluster,
            entities: PARTITIONED_ENTITIES as any,
            synchronize: true,
            logging: false
        };

        const ds = new DataSource(dsOptions);
        await ds.initialize();
        await ds.destroy();
    }

    const sharedDsOptions = {
        type: "postgres" as const,
        ...baseConfig,
        schema: "public",
        entities: SHARED_ENTITIES as any,
        synchronize: true,
        logging: false
    };

    const sharedDs = new DataSource(sharedDsOptions);
    await sharedDs.initialize();
    await sharedDs.destroy();
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

    await adminDs.query("DROP SCHEMA IF EXISTS mainnet CASCADE");
    await adminDs.query("DROP SCHEMA IF EXISTS devnet CASCADE");
    await adminDs.query("DROP SCHEMA IF EXISTS public CASCADE");

    await adminDs.destroy();
}

export { setupE2EDatabase, teardownE2EDatabase };

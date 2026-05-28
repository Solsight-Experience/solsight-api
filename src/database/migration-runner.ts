import { DataSource } from "typeorm";
import { getPartitionedDatabaseConfig } from "../config/database.config";
import { getDatabaseConfig } from "../config/database.config";
import { Cluster, CLUSTERS } from "../common/cluster/cluster.types";
import { PARTITIONED_ENTITIES, SHARED_ENTITIES } from "./entity-registry";

async function createSchemaIfNotExists(dataSource: DataSource, schema: string): Promise<void> {
    const query = `CREATE SCHEMA IF NOT EXISTS "${schema}"`;
    await dataSource.query(query);
}

async function runMigrationsForSchemas(clusters: Cluster[] = CLUSTERS as any): Promise<void> {
    const baseConfig = {
        host: process.env.DATABASE_HOST || "localhost",
        port: parseInt(process.env.DATABASE_PORT || "5432", 10),
        username: process.env.DATABASE_USERNAME || "postgres",
        password: process.env.DATABASE_PASSWORD || "password",
        database: process.env.DATABASE_NAME || "flaxh_trade"
    };

    // Create admin DataSource for schema creation
    const adminDs = new DataSource({
        type: "postgres",
        ...baseConfig,
        synchronize: false,
        logging: false
    });

    await adminDs.initialize();

    // Create schemas
    for (const cluster of clusters) {
        await createSchemaIfNotExists(adminDs, cluster);
    }

    await adminDs.destroy();

    // Run migrations for each cluster
    for (const cluster of clusters) {
        const dsOptions = {
            type: "postgres" as const,
            ...baseConfig,
            schema: cluster,
            entities: [...PARTITIONED_ENTITIES, ...SHARED_ENTITIES] as any,
            migrations: [__dirname + `/migrations/partitioned/*{.ts,.js}`],
            synchronize: false,
            logging: true
        };

        const ds = new DataSource(dsOptions);
        await ds.initialize();

        console.log(`Running migrations for schema: ${cluster}`);
        await ds.runMigrations();

        await ds.destroy();
    }

    // Run shared entity migrations against public schema
    const sharedDsOptions = {
        type: "postgres" as const,
        ...baseConfig,
        schema: "public",
        entities: [...SHARED_ENTITIES, ...PARTITIONED_ENTITIES] as any,
        migrations: [__dirname + `/migrations/shared/*{.ts,.js}`],
        synchronize: false,
        logging: true
    };

    const sharedDs = new DataSource(sharedDsOptions);
    await sharedDs.initialize();

    console.log("Running migrations for public schema (shared entities)");
    await sharedDs.runMigrations();

    await sharedDs.destroy();

    console.log("All migrations completed successfully");
}

export default runMigrationsForSchemas;

import "reflect-metadata";
import { DataSource } from "typeorm";
import { ENTITIES } from "./entity-registry";

const baseConfig = {
    type: "postgres" as const,
    host: process.env.DATABASE_HOST || "localhost",
    port: parseInt(process.env.DATABASE_PORT || "5432", 10),
    username: process.env.DATABASE_USERNAME || "postgres",
    password: process.env.DATABASE_PASSWORD || "password",
    database: process.env.DATABASE_NAME || "flaxh_trade"
};

async function runMigrations(): Promise<void> {
    const ds = new DataSource({
        ...baseConfig,
        entities: ENTITIES,
        migrations: [__dirname + `/migrations/*{.ts,.js}`],
        synchronize: false,
        logging: true
    });

    await ds.initialize();
    await ds.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
    console.log("Running migrations on public schema");
    await ds.runMigrations();
    await ds.destroy();
    console.log("Migrations completed.");
}

export default runMigrations;

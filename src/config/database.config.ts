import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ConfigService } from "@nestjs/config";
import { DataSource, DataSourceOptions } from "typeorm";
import { PARTITIONED_ENTITIES, SHARED_ENTITIES } from "../database/entity-registry";
import { Cluster } from "../common/cluster/cluster.types";

export const getDatabaseConfig = (configService: ConfigService): TypeOrmModuleOptions => {
    const url = configService.get<string>("database.url");

    if (url) {
        return {
            type: "postgres",
            url,
            entities: [__dirname + "/../**/*.entity{.ts,.js}"],
            migrations: [__dirname + "/../database/migrations/*{.ts,.js}"],
            synchronize: configService.get("database.synchronize"),
            logging: configService.get("database.logging"),
            ssl: configService.get("environment") === "production" ? { rejectUnauthorized: false } : false
        };
    }

    return {
        type: "postgres",
        host: configService.get("database.host"),
        port: configService.get("database.port"),
        username: configService.get("database.username"),
        password: configService.get("database.password"),
        database: configService.get("database.database"),
        entities: [__dirname + "/../**/*.entity{.ts,.js}"],
        migrations: [__dirname + "/../database/migrations/*{.ts,.js}"],
        synchronize: configService.get("database.synchronize"),
        logging: configService.get("database.logging"),
        ssl: configService.get("environment") === "production" ? { rejectUnauthorized: false } : false
    };
};

export const getPartitionedDatabaseConfig = (configService: ConfigService, cluster: Cluster): TypeOrmModuleOptions => {
    const url = configService.get<string>("database.url");
    const baseConfig: TypeOrmModuleOptions = {
        type: "postgres",
        schema: cluster,
        entities: [...PARTITIONED_ENTITIES, ...SHARED_ENTITIES] as any,
        migrations: [__dirname + "/../database/migrations/partitioned/*{.ts,.js}"],
        synchronize: false,
        migrationsRun: false,
        logging: configService.get("database.logging"),
        ssl: configService.get("environment") === "production" ? { rejectUnauthorized: false } : false
    };

    if (url) {
        return {
            ...baseConfig,
            url
        };
    }

    return {
        ...baseConfig,
        host: configService.get("database.host"),
        port: configService.get("database.port") as number,
        username: configService.get("database.username"),
        password: configService.get("database.password"),
        database: configService.get("database.database") as string
    };
};

export const dataSourceOptions: DataSourceOptions = {
    type: "postgres",
    url: process.env.DATABASE_URL,
    host: process.env.DATABASE_HOST || "localhost",
    port: parseInt(process.env.DATABASE_PORT || "", 10) || 5432,
    username: process.env.DATABASE_USERNAME || "postgres",
    password: process.env.DATABASE_PASSWORD || "password",
    database: process.env.DATABASE_NAME || "flaxh_trade",
    entities: [__dirname + "/../**/*.entity{.ts,.js}"],
    migrations: [__dirname + "/../database/migrations/*{.ts,.js}"],
    synchronize: process.env.NODE_ENV === "development",
    logging: process.env.NODE_ENV === "development"
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;

import { DataSource } from "typeorm";
import { PARTITIONED_ENTITIES } from "./entity-registry";
import { Cluster } from "../common/cluster/cluster.types";

export function createStandaloneDataSource(cluster: Cluster): DataSource {
    const host = process.env.DATABASE_HOST || "localhost";
    const port = parseInt(process.env.DATABASE_PORT || "5432", 10);
    const username = process.env.DATABASE_USERNAME || "postgres";
    const password = process.env.DATABASE_PASSWORD || "password";
    const database = process.env.DATABASE_NAME || "flaxh_trade";

    return new DataSource({
        type: "postgres",
        host,
        port,
        username,
        password,
        database,
        schema: cluster,
        entities: PARTITIONED_ENTITIES as any,
        synchronize: false,
        migrationsRun: false
    });
}

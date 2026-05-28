import { Injectable, OnApplicationBootstrap } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DATA_SOURCE_MAINNET, DATA_SOURCE_DEVNET, Cluster } from "./cluster.types";
import { PARTITIONED_ENTITIES, SHARED_ENTITIES } from "../../database/entity-registry";
import { getDataSourceToken } from "@nestjs/typeorm";

@Injectable()
export class DataSourceRegistry implements OnApplicationBootstrap {
    private registry: Map<Cluster, DataSource> = new Map();

    constructor(
        @Inject(getDataSourceToken(DATA_SOURCE_MAINNET)) private mainnetDataSource: DataSource,
        @Inject(getDataSourceToken(DATA_SOURCE_DEVNET)) private devnetDataSource: DataSource
    ) {}

    onApplicationBootstrap(): void {
        this.registry.set("mainnet", this.mainnetDataSource);
        this.registry.set("devnet", this.devnetDataSource);

        this.validateEntityRegistration();
    }

    private validateEntityRegistration(): void {
        const partitionedSet = new Set(PARTITIONED_ENTITIES);
        const sharedSet = new Set(SHARED_ENTITIES);

        for (const entity of partitionedSet) {
            if (sharedSet.has(entity)) {
                const entityName = typeof entity === "function" ? entity.name : String(entity);
                throw new Error(`Entity ${entityName} is registered as both PARTITIONED and SHARED. Fix entity-registry.ts.`);
            }
        }
    }

    get(cluster: Cluster): DataSource {
        const dataSource = this.registry.get(cluster);
        if (!dataSource) {
            throw new Error(`DataSource for cluster "${cluster}" not found in registry`);
        }
        return dataSource;
    }
}

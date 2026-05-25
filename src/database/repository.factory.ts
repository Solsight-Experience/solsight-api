import { Injectable, Scope } from "@nestjs/common";
import { ClusterProvider } from "src/infra/solana/cluster.provider";
import { DataSource, EntityTarget, Repository } from "typeorm";

@Injectable({ scope: Scope.REQUEST })
export class RepositoryFactory {
    constructor(
        private readonly datasource: DataSource,
        private readonly clusterCtx: ClusterProvider
    ) {}

    getRepository<T>(entity: EntityTarget<T>): Repository<T> {
        const baseMetadata = this.datasource.getMetadata(entity);
        const resolvedTable = this.clusterCtx.resolveTableName(baseMetadata.tableName);

        return this.datasource.getRepository(entity).extend({
            createQueryBuilder: (alias?: string) => this.datasource.createQueryBuilder().from(resolvedTable, alias ?? baseMetadata.tableName)
        });
    }
}

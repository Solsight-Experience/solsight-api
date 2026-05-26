import { Injectable } from "@nestjs/common";
import { Repository } from "typeorm";
import { Transaction } from "../entities/transaction.entity";
import { CreateTransactionDto } from "../dtos/create-transaction.dto";
import { DataSourceRegistry } from "../../../common/cluster/data-source-registry";
import { ClusterProvider } from "../../../common/cluster/cluster.provider";

@Injectable()
export class TransactionsService {
    constructor(
        private readonly registryService: DataSourceRegistry,
        private readonly clusterProvider: ClusterProvider
    ) {}

    private async getTransactionRepository(): Promise<Repository<Transaction>> {
        const cluster = this.clusterProvider.cluster;
        const dataSource = this.registryService.get(cluster);
        return dataSource.getRepository(Transaction);
    }

    async findOneById(id: string): Promise<Transaction | null> {
        return (await this.getTransactionRepository()).findOne({
            where: { id },
            relations: ["fromWallet", "toWallet"]
        });
    }
    async createTransaction(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
        const repo = await this.getTransactionRepository();
        const transaction = repo.create(createTransactionDto);
        return repo.save(transaction);
    }
}

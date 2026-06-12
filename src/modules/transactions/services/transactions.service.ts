import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Transaction } from "../entities/transaction.entity";
import { CreateTransactionDto } from "../dtos/create-transaction.dto";
import { ClusterProvider } from "../../../common/cluster/cluster.provider";

@Injectable()
export class TransactionsService {
    constructor(
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>,
        private readonly clusterProvider: ClusterProvider
    ) {}

    async findOneById(id: string): Promise<Transaction | null> {
        return this.transactionRepository.findOne({
            where: { id, network: this.clusterProvider.cluster },
            relations: ["fromWallet", "toWallet"]
        });
    }

    async createTransaction(createTransactionDto: CreateTransactionDto): Promise<Transaction> {
        const transaction = this.transactionRepository.create({
            ...createTransactionDto,
            network: this.clusterProvider.cluster
        });
        return this.transactionRepository.save(transaction);
    }
}

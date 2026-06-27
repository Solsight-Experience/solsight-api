import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Transaction } from "../entities/transaction.entity";
import { CreateTransactionDto } from "../dtos/create-transaction.dto";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Injectable()
export class TransactionsService {
    constructor(
        @InjectRepository(Transaction)
        private readonly transactionRepository: Repository<Transaction>
    ) {}

    async findOneById(cluster: Cluster, id: string): Promise<Transaction | null> {
        return this.transactionRepository.findOne({
            where: { id, network: cluster },
            relations: ["fromWallet", "toWallet"]
        });
    }

    async createTransaction(cluster: Cluster, createTransactionDto: CreateTransactionDto): Promise<Transaction> {
        const transaction = this.transactionRepository.create({
            ...createTransactionDto,
            network: cluster
        });
        return this.transactionRepository.save(transaction);
    }
}

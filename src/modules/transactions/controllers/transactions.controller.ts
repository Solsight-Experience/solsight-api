import { Controller, Get, Param, Post, Body, NotFoundException } from "@nestjs/common";
import { TransactionsService } from "../services/transactions.service";
import { CreateTransactionDto } from "../dtos/create-transaction.dto";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Controller("transactions")
export class TransactionsController {
    constructor(private readonly transactionsService: TransactionsService) {}

    @Get(":id")
    async getTransactionById(@RequestCluster() cluster: Cluster, @Param("id") id: string) {
        const transaction = await this.transactionsService.findOneById(cluster, id);
        if (!transaction) {
            throw new NotFoundException(`Transaction with id ${id} not found`);
        }
        return transaction;
    }

    @Post()
    async createTransaction(@RequestCluster() cluster: Cluster, @Body() createTransactionDto: CreateTransactionDto) {
        return this.transactionsService.createTransaction(cluster, createTransactionDto);
    }
}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Transaction } from "./entities/transaction.entity";
import { TransactionsController } from "./controllers/transactions.controller";
import { TransactionsService } from "./services/transactions.service";

@Module({
    imports: [TypeOrmModule.forFeature([Transaction])],
    controllers: [TransactionsController],
    providers: [TransactionsService],
    exports: [TransactionsService]
})
export class TransactionsModule {}

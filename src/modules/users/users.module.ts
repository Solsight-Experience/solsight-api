import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Wallet } from "../wallets/entities/wallet.entity";
import { Transaction } from "../transactions/entities/transaction.entity";
import { UsersController } from "./controllers/users.controller";
import { UsersService } from "./services/users.service";
import { UsersRepository } from "./repositories/users.repository";

@Module({
    imports: [TypeOrmModule.forFeature([User, Wallet, Transaction])],
    controllers: [UsersController],
    providers: [UsersService, UsersRepository],
    exports: [UsersService, UsersRepository]
})
export class UsersModule {}

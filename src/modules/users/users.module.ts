import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User } from "./entities/user.entity";
import { Wallet } from "../wallets/entities/wallet.entity";
import { SwapExecution } from "../admin-analytics/entities/swap-execution.entity";
import { UsersController } from "./controllers/users.controller";
import { UsersService } from "./services/users.service";
import { UsersRepository } from "./repositories/users.repository";

@Module({
    imports: [TypeOrmModule.forFeature([User, Wallet, SwapExecution])],
    controllers: [UsersController],
    providers: [UsersService, UsersRepository],
    exports: [UsersService, UsersRepository]
})
export class UsersModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Token } from "../tokens/entities/token.entity";
import { AccountController } from "./controllers/account.controller";
import { AccountService } from "./services/account.service";

@Module({
    imports: [TypeOrmModule.forFeature([Token])],
    controllers: [AccountController],
    providers: [AccountService]
})
export class AccountModule {}

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AccountController } from "./controllers/account.controller";
import { AccountService } from "./services/account.service";
import { FavoriteToken } from "./entities/favorite-token.entity";
import { Token } from "../tokens/entities/token.entity";

@Module({
    imports: [TypeOrmModule.forFeature([FavoriteToken, Token])],
    controllers: [AccountController],
    providers: [AccountService]
})
export class AccountModule {}

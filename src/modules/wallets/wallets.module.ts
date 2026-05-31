import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Wallet } from "./entities/wallet.entity";
import { WalletsController } from "./controllers/wallets.controller";
import { UsersWalletsController } from "./controllers/users-wallets.controller";
import { WalletsService } from "./services/wallets.service";
import { SolanaModule } from "../../infra/solana/solana.module";
import { TokensModule } from "../tokens/tokens.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";

@Module({
    imports: [TypeOrmModule.forFeature([Wallet]), SolanaModule, TokensModule, CoinGeckoModule],
    controllers: [WalletsController, UsersWalletsController],
    providers: [WalletsService],
    exports: [WalletsService]
})
export class WalletsModule {}

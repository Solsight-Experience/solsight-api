import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Token } from "../tokens/entities/token.entity";
import { Category } from "../tokens/entities/category.entity";
import { DiscoveryController } from "./controllers/discovery.controller";
import { DiscoveryService } from "./services/discovery.service";
import { JupiterModule } from "../../infra/jupiter/jupiter.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";
import { SolanaModule } from "../../infra/solana/solana.module";
import { RedisModule } from "../../redis";

@Module({
    imports: [TypeOrmModule.forFeature([Token, Category]), JupiterModule, CoinGeckoModule, SolanaModule, RedisModule],
    controllers: [DiscoveryController],
    providers: [DiscoveryService],
    exports: [DiscoveryService]
})
export class DiscoveryModule {}

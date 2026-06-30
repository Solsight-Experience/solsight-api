import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Token } from "../tokens/entities/token.entity";
import { Category } from "../tokens/entities/category.entity";
import { OhlcCandle } from "../tokens/entities/ohlc-candle.entity";
import { Transaction } from "../transactions/entities/transaction.entity";
import { DiscoveryController } from "./controllers/discovery.controller";
import { DiscoveryService } from "./services/discovery.service";
import { JupiterModule } from "../../infra/jupiter/jupiter.module";
import { CoinGeckoModule } from "../../infra/coingecko/coingecko.module";
import { RedisModule } from "../../redis";

@Module({
    imports: [TypeOrmModule.forFeature([Token, Category, OhlcCandle, Transaction]), JupiterModule, CoinGeckoModule, RedisModule],
    controllers: [DiscoveryController],
    providers: [DiscoveryService],
    exports: [DiscoveryService]
})
export class DiscoveryModule {}

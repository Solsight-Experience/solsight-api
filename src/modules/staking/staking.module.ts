import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SolanaModule } from "../../infra/solana/solana.module";
import { StakingController } from "./controllers/staking.controller";
import { StakingHistoryEntity } from "./entities/staking-history.entity";
import { StakingHistorySyncStateEntity } from "./entities/staking-history-sync-state.entity";
import { StakingNativeAccountEntity } from "./entities/staking-native-account.entity";
import { StakingService } from "./services/staking.service";

@Module({
    imports: [ConfigModule, SolanaModule, TypeOrmModule.forFeature([StakingHistoryEntity, StakingHistorySyncStateEntity, StakingNativeAccountEntity])],
    controllers: [StakingController],
    providers: [StakingService]
})
export class StakingModule {}

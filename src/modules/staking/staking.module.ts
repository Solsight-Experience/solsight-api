import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SolanaModule } from "../../infra/solana/solana.module";
import { StakingController } from "./controllers/staking.controller";
import { StakingService } from "./services/staking.service";

@Module({
    imports: [ConfigModule, SolanaModule],
    controllers: [StakingController],
    providers: [StakingService]
})
export class StakingModule {}

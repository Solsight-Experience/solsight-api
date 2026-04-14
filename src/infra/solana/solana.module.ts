import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { SOLANA_RPC_SERVICE } from "./constants/solana.token";
import { HeliusService } from "./helius.service";
import { SolanaService } from "./solana.service";

@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: SOLANA_RPC_SERVICE,
            useFactory: (config: ConfigService) => new HeliusService(config),
            inject: [ConfigService]
        },
        SolanaService,
        {
            provide: HeliusService,
            useExisting: SOLANA_RPC_SERVICE
        }
    ],
    exports: [SolanaService, HeliusService, SOLANA_RPC_SERVICE]
})
export class SolanaModule {}

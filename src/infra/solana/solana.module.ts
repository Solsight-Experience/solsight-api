import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { HELIUS_DEVNET, HELIUS_MAINNET } from "./constants/solana.token";
import { HeliusService } from "./helius.service";
import { HeliusResolver } from "./helius.resolver";
import { SolanaService } from "./solana.service";
import { resolveHeliusRpcUrl } from "./helius-url.util";

@Module({
    imports: [ConfigModule],
    providers: [
        {
            provide: HELIUS_MAINNET,
            useFactory: (config: ConfigService) =>
                new HeliusService(resolveHeliusRpcUrl(config.getOrThrow<string>("helius.rpcUrl"), "mainnet"), config.getOrThrow<string>("helius.apiKey")),
            inject: [ConfigService]
        },
        {
            provide: HELIUS_DEVNET,
            useFactory: (config: ConfigService) =>
                new HeliusService(resolveHeliusRpcUrl(config.getOrThrow<string>("helius.rpcUrl"), "devnet"), config.getOrThrow<string>("helius.apiKey")),
            inject: [ConfigService]
        },
        HeliusResolver,
        SolanaService
    ],
    exports: [SolanaService, HeliusResolver]
})
export class SolanaModule {}

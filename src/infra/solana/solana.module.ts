import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SolanaService } from "./solana.service";

@Module({
    imports: [ConfigModule],
    providers: [SolanaService],
    exports: [SolanaService]
})
export class SolanaModule {}

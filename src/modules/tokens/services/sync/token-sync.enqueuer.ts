import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Token } from "../../entities/token.entity";
import { RedisService } from "../../../../redis/services/redis.service";
import type { Cluster } from "../../../../common/cluster/cluster.types";

// Well-known system mints that are always present; never need syncing.
const SYSTEM_MINTS = new Set([
    "So11111111111111111111111111111111111111112", // Wrapped SOL
    "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
    "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" // USDT
]);

@Injectable()
export class TokenSyncEnqueuer {
    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly redisService: RedisService
    ) {}

    async enqueueIfUnknown(cluster: Cluster, mint: string): Promise<void> {
        if (SYSTEM_MINTS.has(mint)) return;

        // Fast path: sentinel key present means we already know this token
        const knownKey = RedisService.KEYS.KNOWN_TOKEN(cluster, mint);
        if (await this.redisService.exists(knownKey)) return;

        // DB check: if exists, populate sentinel and skip
        const exists = await this.tokenRepository.exists({ where: { address: mint, network: cluster } });
        if (exists) {
            await this.redisService.set(knownKey, "1", RedisService.TTL.KNOWN_TOKEN);
            return;
        }

        // Unknown — add to pending set (SADD is idempotent)
        await this.redisService.sadd(RedisService.KEYS.PENDING_TOKEN_SYNC(cluster), mint);
    }
}

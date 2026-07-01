import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Token } from "../../entities/token.entity";
import { mapJupiterTokenToEntity } from "../../mapper/token.mapper";
import { JupiterService } from "../../../../infra/jupiter/jupiter.service";
import { SolanaService } from "../../../../infra/solana/solana.service";
import { RedisService } from "../../../../redis/services/redis.service";
import { CLUSTERS, type Cluster } from "../../../../common/cluster/cluster.types";
import { logError } from "../../../../common/errors/error-helper";

const BATCH_SIZE = 25;

@Injectable()
export class TokenSyncService {
    private readonly logger = new Logger(TokenSyncService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly jupiterService: JupiterService,
        private readonly solanaService: SolanaService,
        private readonly redisService: RedisService
    ) {}

    @Cron(CronExpression.EVERY_MINUTE)
    async drainPendingQueues(): Promise<void> {
        for (const cluster of CLUSTERS) {
            await this.drainCluster(cluster);
        }
    }

    async drainCluster(cluster: Cluster): Promise<void> {
        const mints = await this.redisService.spop(RedisService.KEYS.PENDING_TOKEN_SYNC(cluster), BATCH_SIZE);
        if (mints.length === 0) return;

        this.logger.log(`Syncing ${mints.length} pending tokens for ${cluster}`);
        await this.syncMints(cluster, mints);
    }

    async syncMints(cluster: Cluster, mints: string[]): Promise<void> {
        const tokenDataMap = new Map<string, Partial<Token>>();

        // On mainnet try Jupiter first (batch)
        if (cluster === "mainnet") {
            try {
                const jupiterTokens = await this.jupiterService.searchTokens(cluster, mints);
                for (const jt of jupiterTokens) {
                    if (jt.id) {
                        tokenDataMap.set(jt.id, mapJupiterTokenToEntity(jt));
                    }
                }
            } catch (error) {
                logError(this.logger, `Jupiter batch fetch failed for ${cluster}`, error);
            }
        }

        // On-chain fallback for mints Jupiter didn't return, or all of devnet
        const remaining = mints.filter((m) => !tokenDataMap.has(m));
        await Promise.all(
            remaining.map(async (mint) => {
                const data = await this.fetchFromOnChain(cluster, mint);
                if (data) tokenDataMap.set(mint, data);
            })
        );

        if (tokenDataMap.size === 0) return;

        const rows = Array.from(tokenDataMap.values()).map((data) => ({
            network: cluster,
            ...data
        }));

        try {
            await this.tokenRepository.upsert(rows, { conflictPaths: ["address", "network"], skipUpdateIfNoValuesChanged: true });
        } catch (error) {
            logError(this.logger, `Failed to upsert ${rows.length} tokens for ${cluster}`, error);
            return;
        }

        // Mark synced mints as known; invalidate any stale metadata cache
        await Promise.all(
            Array.from(tokenDataMap.keys()).map(async (mint) => {
                await this.redisService.set(RedisService.KEYS.KNOWN_TOKEN(cluster, mint), "1", RedisService.TTL.KNOWN_TOKEN);
                await this.redisService.del(RedisService.KEYS.TOKEN_METADATA(cluster, mint));
            })
        );

        this.logger.log(`Upserted ${tokenDataMap.size} tokens for ${cluster}`);
    }

    private async fetchFromOnChain(cluster: Cluster, mint: string): Promise<Partial<Token> | null> {
        const decimals = await this.solanaService.getMintDecimals(cluster, mint);
        if (decimals === null) return null;

        return {
            address: mint,
            symbol: mint.slice(0, 8),
            name: mint,
            decimals,
            logoUri: undefined
        };
    }
}

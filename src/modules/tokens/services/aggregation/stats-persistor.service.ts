import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Token } from "../../entities/token.entity";
import { RedisService } from "../../../../redis/services/redis.service";
import { CLUSTERS, type Cluster } from "../../../../common/cluster/cluster.types";
import { logError } from "../../../../common/errors/error-helper";
import { isValidPrice } from "../../types/swap-event.types";

const PERSIST_BATCH_SIZE = 100;

@Injectable()
export class StatsPersistorService {
    private readonly logger = new Logger(StatsPersistorService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly redisService: RedisService
    ) {}

    /**
     * Persist real-time Redis aggregates (volume, txns) back into the tokens table.
     * Runs every 2 minutes for all clusters, enabling devnet trending to sort by live data.
     */
    @Cron(CronExpression.EVERY_MINUTE)
    async persistStats(): Promise<void> {
        for (const cluster of CLUSTERS) {
            await this.persistForCluster(cluster);
        }
    }

    private async persistForCluster(cluster: Cluster): Promise<void> {
        const redis = this.redisService.getClient();
        if (!redis) return;

        try {
            const activeKey = RedisService.KEYS.ACTIVE_TOKENS(cluster);
            const mints = await this.redisService.smembers(activeKey);
            if (mints.length === 0) return;

            let updated = 0;
            const toRemove: string[] = [];

            for (let i = 0; i < mints.length; i += PERSIST_BATCH_SIZE) {
                const batch = mints.slice(i, i + PERSIST_BATCH_SIZE);

                await Promise.all(
                    batch.map(async (mint) => {
                        const { volume24h, txns24hTotal, txns24hBuys, txns24hSells } = await this.readAggregates(cluster, mint, redis);

                        if (txns24hTotal === 0) {
                            // No activity — remove from active set on next housekeeping
                            toRemove.push(mint);
                            return;
                        }

                        try {
                            await this.tokenRepository.update({ address: mint, network: cluster }, { volume24h, txns24hTotal, txns24hBuys, txns24hSells });
                            updated++;
                        } catch (error) {
                            logError(this.logger, `Failed to persist stats for ${mint} on ${cluster}`, error);
                        }
                    })
                );
            }

            // Remove inactive mints from ACTIVE_TOKENS set
            if (toRemove.length > 0) {
                await this.redisService.srem(activeKey, ...toRemove);
            }

            if (updated > 0) {
                this.logger.debug(`Persisted stats for ${updated} tokens on ${cluster}`);
            }
        } catch (error) {
            logError(this.logger, `Stats persist failed for ${cluster}`, error);
        }
    }

    private async readAggregates(
        cluster: Cluster,
        mint: string,
        redis: ReturnType<RedisService["getClient"]>
    ): Promise<{ volume24h: number; txns24hTotal: number; txns24hBuys: number; txns24hSells: number }> {
        if (!redis) return { volume24h: 0, txns24hTotal: 0, txns24hBuys: 0, txns24hSells: 0 };

        try {
            const volumeKey = RedisService.KEYS.VOLUME_24H(cluster, mint);
            const txnsKey = RedisService.KEYS.TXNS_24H(cluster, mint);

            const [volumeEntries, txnsEntries] = await Promise.all([redis.zrange(volumeKey, 0, -1), redis.zrange(txnsKey, 0, -1)]);

            let volume24h = 0;
            for (const entry of volumeEntries ?? []) {
                const [volumeStr, priceStr] = entry.split(":");
                const price = parseFloat(priceStr);
                if (!isValidPrice(price)) continue;
                volume24h += parseFloat(volumeStr) || 0;
            }

            let txns24hBuys = 0;
            let txns24hSells = 0;
            for (const entry of txnsEntries ?? []) {
                const [txType, priceStr] = entry.split(":");
                const price = parseFloat(priceStr);
                if (!isValidPrice(price)) continue;
                if (txType === "buy") txns24hBuys++;
                else if (txType === "sell") txns24hSells++;
            }

            return { volume24h, txns24hTotal: txns24hBuys + txns24hSells, txns24hBuys, txns24hSells };
        } catch (error) {
            logError(this.logger, `Failed to read aggregates for ${mint} on ${cluster}`, error);
            return { volume24h: 0, txns24hTotal: 0, txns24hBuys: 0, txns24hSells: 0 };
        }
    }
}

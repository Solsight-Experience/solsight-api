import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { RedisService } from "../../../../redis/services/redis.service";
import { HolderCommand, TrackedMintState } from "../../types/holder-tracking.types";
import { logError } from "src/common/errors/error-helper";
import type { Cluster } from "../../../../common/cluster/cluster.types";
import { RoomFactory } from "./room/room.factory";

const HOLDER_COMMAND_CHANNEL = (network: string) => `solsight:holder_commands:${network}`;
const UNTRACK_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes grace period

/**
 * Service that manages lazy holder tracking.
 *
 * When the first subscriber joins a holders room for a token, this service
 * sends a "track" command to the indexer. When the last subscriber leaves,
 * it waits for a grace period before sending "untrack".
 */
@Injectable()
export class HolderTrackingService implements OnModuleDestroy {
    private readonly logger = new Logger(HolderTrackingService.name);
    private readonly trackedMints = new Map<string, TrackedMintState>();

    constructor(private readonly redisService: RedisService) {}

    onModuleDestroy(): void {
        // Clear all timers
        for (const state of this.trackedMints.values()) {
            if (state.untrackTimer) {
                clearTimeout(state.untrackTimer);
            }
        }
    }

    logResponse(event: unknown, channel: string): void {
        const cluster = channel.split(":").pop();
        this.logger.debug(`Indexer ${cluster} response: ${JSON.stringify(event)}`);
    }

    /**
     * Called when a client subscribes to a holders room.
     * Extracts the token mint from the room name and tracks it.
     */
    async onHolderRoomJoin(room: string): Promise<void> {
        const { cluster, resource: mint } = RoomFactory.parse(room);
        const trackingKey = this.trackingKey(cluster, mint);

        let state = this.trackedMints.get(trackingKey);

        if (!state) {
            state = {
                subscriberCount: 0,
                isTracked: false
            };
            this.trackedMints.set(trackingKey, state);
        }

        // Cancel any pending untrack
        if (state.untrackTimer) {
            clearTimeout(state.untrackTimer);
            state.untrackTimer = undefined;
            this.logger.debug(`Cancelled untrack timer for ${mint}`);
        }

        state.subscriberCount++;
        this.logger.debug(`Holder room join: ${mint}, subscribers: ${state.subscriberCount}`);

        // If this is the first subscriber and not already tracked, send track command
        if (state.subscriberCount === 1 && !state.isTracked) {
            await this.sendTrackCommand(cluster, mint);
            state.isTracked = true;
        }
    }

    /**
     * Called when a client leaves a holders room.
     * If no subscribers remain, starts a grace period timer before untracking.
     */
    onHolderRoomLeave(room: string): void {
        const { cluster, resource: mint } = RoomFactory.parse(room);
        const trackingKey = this.trackingKey(cluster, mint);

        const state = this.trackedMints.get(trackingKey);
        if (!state) return;

        state.subscriberCount = Math.max(0, state.subscriberCount - 1);
        this.logger.debug(`Holder room leave: ${mint}, subscribers: ${state.subscriberCount}`);

        // If no subscribers left, start grace period timer
        if (state.subscriberCount === 0 && state.isTracked) {
            this.logger.debug(`Starting ${UNTRACK_GRACE_PERIOD_MS / 1000}s grace period for ${mint}`);

            state.untrackTimer = setTimeout(() => {
                void this.untrackAfterGracePeriod(cluster, mint).catch((error) => {
                    logError(this.logger, `Failed to untrack holder mint ${mint}`, error);
                });
            }, UNTRACK_GRACE_PERIOD_MS);
        }
    }

    private async untrackAfterGracePeriod(cluster: Cluster, mint: string): Promise<void> {
        const trackingKey = this.trackingKey(cluster, mint);
        // Double-check no new subscribers joined during grace period
        const currentState = this.trackedMints.get(trackingKey);
        if (currentState && currentState.subscriberCount === 0 && currentState.isTracked) {
            await this.sendUntrackCommand(cluster, mint);
            currentState.isTracked = false;
            this.trackedMints.delete(trackingKey);
        }
    }

    /**
     * Get the current tracking status for debugging.
     */
    getTrackingStatus(): { cluster: Cluster; mint: string; subscribers: number; tracked: boolean }[] {
        return Array.from(this.trackedMints.entries()).map(([key, state]) => {
            const [cluster, mint] = key.split(":") as [Cluster, string];
            return {
                cluster,
                mint,
                subscribers: state.subscriberCount,
                tracked: state.isTracked
            };
        });
    }

    /**
     * Manually trigger tracking for a mint (e.g., from an admin endpoint).
     */
    async trackMint(cluster: Cluster, mint: string, bootstrap = true): Promise<void> {
        const trackingKey = this.trackingKey(cluster, mint);
        let state = this.trackedMints.get(trackingKey);

        if (!state) {
            state = {
                subscriberCount: 0,
                isTracked: false
            };
            this.trackedMints.set(trackingKey, state);
        }

        if (!state.isTracked) {
            await this.sendTrackCommand(cluster, mint, bootstrap);
            state.isTracked = true;
        }
    }

    /**
     * Manually stop tracking for a mint (e.g., from an admin endpoint).
     */
    async untrackMint(cluster: Cluster, mint: string): Promise<void> {
        const trackingKey = this.trackingKey(cluster, mint);
        const state = this.trackedMints.get(trackingKey);
        if (state?.isTracked) {
            if (state.untrackTimer) {
                clearTimeout(state.untrackTimer);
            }
            await this.sendUntrackCommand(cluster, mint);
            state.isTracked = false;
            this.trackedMints.delete(trackingKey);
        }
    }

    private trackingKey(cluster: Cluster, mint: string): string {
        return `${cluster}:${mint}`;
    }

    private async sendTrackCommand(cluster: Cluster, mint: string, bootstrap = true): Promise<void> {
        const command: HolderCommand = {
            action: "track",
            mint,
            bootstrap
        };

        const redis = this.redisService.getClient();
        if (!redis) {
            this.logger.warn(`Cannot send track command for ${mint}: Redis not available`);
            return;
        }

        try {
            await redis.publish(HOLDER_COMMAND_CHANNEL(cluster), JSON.stringify(command));
            this.logger.log(`Sent track command for ${mint} (bootstrap: ${bootstrap})`);
        } catch (error) {
            logError(this.logger, `Failed to send track command for ${mint}`, error);
        }
    }

    private async sendUntrackCommand(cluster: Cluster, mint: string): Promise<void> {
        const command: HolderCommand = {
            action: "untrack",
            mint
        };

        const redis = this.redisService.getClient();
        if (!redis) {
            this.logger.warn(`Cannot send untrack command for ${mint}: Redis not available`);
            return;
        }

        try {
            await redis.publish(HOLDER_COMMAND_CHANNEL(cluster), JSON.stringify(command));
            this.logger.log(`Sent untrack command for ${mint}`);
        } catch (error) {
            logError(this.logger, `Failed to send untrack command for ${mint}`, error);
        }
    }
}

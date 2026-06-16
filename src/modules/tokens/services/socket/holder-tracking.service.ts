import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PubSubService } from "../../../../redis/services/pubsub.service";
import { RedisService } from "../../../../redis/services/redis.service";
import { HolderCommand, TrackedMintState } from "../../types/holder-tracking.types";
import { ClusterProvider } from "../../../../common/cluster/cluster.provider";

const HOLDER_COMMAND_CHANNEL = (network: string) => `solsight:holder_commands:${network}`;
const HOLDER_RESPONSE_CHANNEL = (network: string) => `solsight:holder_responses:${network}`;
const UNTRACK_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes grace period

/**
 * Service that manages lazy holder tracking.
 *
 * When the first subscriber joins a holders room for a token, this service
 * sends a "track" command to the indexer. When the last subscriber leaves,
 * it waits for a grace period before sending "untrack".
 */
@Injectable()
export class HolderTrackingService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(HolderTrackingService.name);
    private readonly trackedMints = new Map<string, TrackedMintState>();

    constructor(
        private readonly redisService: RedisService,
        private readonly pubSubService: PubSubService,
        private readonly clusterProvider: ClusterProvider
    ) {}

    async onModuleInit(): Promise<void> {
        // Subscribe to responses from indexer (optional, for logging)
        for (const network of ["mainnet", "devnet"]) {
            await this.pubSubService.subscribe(HOLDER_RESPONSE_CHANNEL(network), (message) => {
                this.logger.debug(`Indexer ${network} response: ${JSON.stringify(message)}`);
            });
        }

        this.logger.log("HolderTrackingService initialized");
    }

    onModuleDestroy(): void {
        // Clear all timers
        for (const state of this.trackedMints.values()) {
            if (state.untrackTimer) {
                clearTimeout(state.untrackTimer);
            }
        }
    }

    /**
     * Called when a client subscribes to a holders room.
     * Extracts the token mint from the room name and tracks it.
     */
    async onHolderRoomJoin(room: string): Promise<void> {
        const mint = this.extractMintFromRoom(room);
        if (!mint) return;

        let state = this.trackedMints.get(mint);

        if (!state) {
            state = {
                subscriberCount: 0,
                isTracked: false
            };
            this.trackedMints.set(mint, state);
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
            await this.sendTrackCommand(mint);
            state.isTracked = true;
        }
    }

    /**
     * Called when a client leaves a holders room.
     * If no subscribers remain, starts a grace period timer before untracking.
     */
    onHolderRoomLeave(room: string): void {
        const mint = this.extractMintFromRoom(room);
        if (!mint) return;

        const state = this.trackedMints.get(mint);
        if (!state) return;

        state.subscriberCount = Math.max(0, state.subscriberCount - 1);
        this.logger.debug(`Holder room leave: ${mint}, subscribers: ${state.subscriberCount}`);

        // If no subscribers left, start grace period timer
        if (state.subscriberCount === 0 && state.isTracked) {
            this.logger.debug(`Starting ${UNTRACK_GRACE_PERIOD_MS / 1000}s grace period for ${mint}`);

            state.untrackTimer = setTimeout(() => {
                void this.untrackAfterGracePeriod(mint).catch((error) => {
                    this.logger.error(`Failed to untrack holder mint ${mint}`, error);
                });
            }, UNTRACK_GRACE_PERIOD_MS);
        }
    }

    private async untrackAfterGracePeriod(mint: string): Promise<void> {
        // Double-check no new subscribers joined during grace period
        const currentState = this.trackedMints.get(mint);
        if (currentState && currentState.subscriberCount === 0 && currentState.isTracked) {
            await this.sendUntrackCommand(mint);
            currentState.isTracked = false;
            this.trackedMints.delete(mint);
        }
    }

    /**
     * Get the current tracking status for debugging.
     */
    getTrackingStatus(): { mint: string; subscribers: number; tracked: boolean }[] {
        return Array.from(this.trackedMints.entries()).map(([mint, state]) => ({
            mint,
            subscribers: state.subscriberCount,
            tracked: state.isTracked
        }));
    }

    /**
     * Manually trigger tracking for a mint (e.g., from an admin endpoint).
     */
    async trackMint(mint: string, bootstrap = true): Promise<void> {
        let state = this.trackedMints.get(mint);

        if (!state) {
            state = {
                subscriberCount: 0,
                isTracked: false
            };
            this.trackedMints.set(mint, state);
        }

        if (!state.isTracked) {
            await this.sendTrackCommand(mint, bootstrap);
            state.isTracked = true;
        }
    }

    /**
     * Manually stop tracking for a mint (e.g., from an admin endpoint).
     */
    async untrackMint(mint: string): Promise<void> {
        const state = this.trackedMints.get(mint);
        if (state?.isTracked) {
            if (state.untrackTimer) {
                clearTimeout(state.untrackTimer);
            }
            await this.sendUntrackCommand(mint);
            state.isTracked = false;
            this.trackedMints.delete(mint);
        }
    }

    private extractMintFromRoom(room: string): string | null {
        // Room format: "holders:{mint}:{interval}" e.g., "holders:So111...112:5s"
        const parts = room.split(":");
        if (parts.length >= 2 && parts[0] === "holders") {
            return parts[1];
        }
        return null;
    }

    private async sendTrackCommand(mint: string, bootstrap = true): Promise<void> {
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
            await redis.publish(HOLDER_COMMAND_CHANNEL(this.clusterProvider.cluster), JSON.stringify(command));
            this.logger.log(`Sent track command for ${mint} (bootstrap: ${bootstrap})`);
        } catch (error) {
            this.logger.error(`Failed to send track command for ${mint}:`, error);
        }
    }

    private async sendUntrackCommand(mint: string): Promise<void> {
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
            await redis.publish(HOLDER_COMMAND_CHANNEL(this.clusterProvider.cluster), JSON.stringify(command));
            this.logger.log(`Sent untrack command for ${mint}`);
        } catch (error) {
            this.logger.error(`Failed to send untrack command for ${mint}:`, error);
        }
    }
}

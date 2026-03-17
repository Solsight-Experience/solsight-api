import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PubSubService } from '../../../../redis/services/pubsub.service';
import { RedisService } from '../../../../redis/services/redis.service';

const HOLDER_COMMAND_CHANNEL = 'solsight:holder_commands';
const HOLDER_RESPONSE_CHANNEL = 'solsight:holder_responses';
const UNTRACK_GRACE_PERIOD_MS = 5 * 60 * 1000; // 5 minutes grace period

interface HolderCommand {
  action: 'track' | 'untrack' | 'list';
  mint?: string;
  bootstrap?: boolean;
}

interface TrackedMintState {
  subscriberCount: number;
  untrackTimer?: NodeJS.Timeout;
  isTracked: boolean;
}

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
  ) {}

  async onModuleInit(): Promise<void> {
    // Subscribe to responses from indexer (optional, for logging)
    await this.pubSubService.subscribe(HOLDER_RESPONSE_CHANNEL, (message) => {
      this.logger.debug(`Indexer response: ${JSON.stringify(message)}`);
    });

    this.logger.log('HolderTrackingService initialized');
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
        isTracked: false,
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
  async onHolderRoomLeave(room: string): Promise<void> {
    const mint = this.extractMintFromRoom(room);
    if (!mint) return;

    const state = this.trackedMints.get(mint);
    if (!state) return;

    state.subscriberCount = Math.max(0, state.subscriberCount - 1);
    this.logger.debug(`Holder room leave: ${mint}, subscribers: ${state.subscriberCount}`);

    // If no subscribers left, start grace period timer
    if (state.subscriberCount === 0 && state.isTracked) {
      this.logger.debug(`Starting ${UNTRACK_GRACE_PERIOD_MS / 1000}s grace period for ${mint}`);

      state.untrackTimer = setTimeout(async () => {
        // Double-check no new subscribers joined during grace period
        const currentState = this.trackedMints.get(mint);
        if (currentState && currentState.subscriberCount === 0 && currentState.isTracked) {
          await this.sendUntrackCommand(mint);
          currentState.isTracked = false;
          this.trackedMints.delete(mint);
        }
      }, UNTRACK_GRACE_PERIOD_MS);
    }
  }

  /**
   * Get the current tracking status for debugging.
   */
  getTrackingStatus(): { mint: string; subscribers: number; tracked: boolean }[] {
    return Array.from(this.trackedMints.entries()).map(([mint, state]) => ({
      mint,
      subscribers: state.subscriberCount,
      tracked: state.isTracked,
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
        isTracked: false,
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
    const parts = room.split(':');
    if (parts.length >= 2 && parts[0] === 'holders') {
      return parts[1];
    }
    return null;
  }

  private async sendTrackCommand(mint: string, bootstrap = true): Promise<void> {
    const command: HolderCommand = {
      action: 'track',
      mint,
      bootstrap,
    };

    const redis = this.redisService.getClient();
    if (!redis) {
      this.logger.warn(`Cannot send track command for ${mint}: Redis not available`);
      return;
    }

    try {
      await redis.publish(HOLDER_COMMAND_CHANNEL, JSON.stringify(command));
      this.logger.log(`Sent track command for ${mint} (bootstrap: ${bootstrap})`);
    } catch (error) {
      this.logger.error(`Failed to send track command for ${mint}:`, error);
    }
  }

  private async sendUntrackCommand(mint: string): Promise<void> {
    const command: HolderCommand = {
      action: 'untrack',
      mint,
    };

    const redis = this.redisService.getClient();
    if (!redis) {
      this.logger.warn(`Cannot send untrack command for ${mint}: Redis not available`);
      return;
    }

    try {
      await redis.publish(HOLDER_COMMAND_CHANNEL, JSON.stringify(command));
      this.logger.log(`Sent untrack command for ${mint}`);
    } catch (error) {
      this.logger.error(`Failed to send untrack command for ${mint}:`, error);
    }
  }
}

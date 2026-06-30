import { Injectable } from "@nestjs/common";
import { CLUSTERS } from "../../../../common/cluster/cluster.types";
import { REDIS_CHANNELS } from "../../../../redis/channels";
import type { EventHandler } from "../../../../redis/event-handler";
import type { RedisChannel } from "../../../../redis/utils/redisChannels";
import { HolderTrackingService } from "./holder-tracking.service";

@Injectable()
export class HolderResponseHandler implements EventHandler<unknown> {
    readonly name = HolderResponseHandler.name;

    constructor(private readonly holderTrackingService: HolderTrackingService) {}

    channels(): RedisChannel<unknown>[] {
        return CLUSTERS.map((cluster) => REDIS_CHANNELS.HOLDER_RESPONSES(cluster));
    }

    handle(event: unknown, channel: RedisChannel<unknown>): void {
        this.holderTrackingService.logResponse(event, channel);
    }
}

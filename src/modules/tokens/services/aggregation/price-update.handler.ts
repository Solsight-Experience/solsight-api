import { Injectable } from "@nestjs/common";
import { CLUSTERS } from "../../../../common/cluster/cluster.types";
import { REDIS_CHANNELS, clusterFromChannel } from "../../../../redis/channels";
import type { EventHandler } from "../../../../redis/event-handler";
import type { RedisChannel } from "../../../../redis/utils/redisChannels";
import type { PriceUpdateEvent } from "../../types/holder-aggregation.types";
import { HolderAggregationService } from "./holder-aggregation.service";

@Injectable()
export class PriceUpdateHandler implements EventHandler<PriceUpdateEvent> {
    readonly name = PriceUpdateHandler.name;

    constructor(private readonly holderAggregationService: HolderAggregationService) {}

    channels(): RedisChannel<PriceUpdateEvent>[] {
        return CLUSTERS.map((cluster) => REDIS_CHANNELS.PRICE_UPDATES(cluster));
    }

    async handle(event: PriceUpdateEvent, channel: RedisChannel<PriceUpdateEvent>): Promise<void> {
        await this.holderAggregationService.onPriceUpdate({
            ...event,
            network: event.network ?? clusterFromChannel(channel)
        });
    }
}

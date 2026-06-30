import { Injectable } from "@nestjs/common";
import { CLUSTERS } from "../../../../common/cluster/cluster.types";
import { REDIS_CHANNELS, clusterFromChannel } from "../../../../redis/channels";
import type { EventHandler } from "../../../../redis/event-handler";
import type { RedisChannel } from "../../../../redis/utils/redisChannels";
import type { SwapEvent } from "../../types/swap-event.types";
import { TokenSocketService } from "./token.socket.service";

@Injectable()
export class TradeFanoutHandler implements EventHandler<SwapEvent> {
    readonly name = TradeFanoutHandler.name;

    constructor(private readonly tokenSocketService: TokenSocketService) {}

    channels(): RedisChannel<SwapEvent>[] {
        return CLUSTERS.map((cluster) => REDIS_CHANNELS.TRADE_EVENTS(cluster));
    }

    async handle(event: SwapEvent, channel: RedisChannel<SwapEvent>): Promise<void> {
        const normalizedEvent = event.network ? event : { ...event, network: clusterFromChannel(channel) };
        await this.tokenSocketService.processSwapEvent(normalizedEvent);
    }
}

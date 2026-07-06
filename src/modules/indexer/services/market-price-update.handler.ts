import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CLUSTERS } from "../../../common/cluster/cluster.types";
import { logError } from "../../../common/errors/error-helper";
import { REDIS_CHANNELS, clusterFromChannel } from "../../../redis/channels";
import type { EventHandler } from "../../../redis/event-handler";
import type { RedisChannel } from "../../../redis/utils/redisChannels";
import type { PriceUpdateEvent } from "../../tokens/types/holder-aggregation.types";
import { isValidPrice } from "../../tokens/types/swap-event.types";
import { MarketPriceEvent } from "../entities/market-price-event.entity";

@Injectable()
export class MarketPriceUpdateHandler implements EventHandler<PriceUpdateEvent> {
    readonly name = MarketPriceUpdateHandler.name;
    private readonly logger = new Logger(MarketPriceUpdateHandler.name);

    constructor(
        @InjectRepository(MarketPriceEvent)
        private readonly priceEventRepository: Repository<MarketPriceEvent>
    ) {}

    channels(): RedisChannel<PriceUpdateEvent>[] {
        return CLUSTERS.map((cluster) => REDIS_CHANNELS.PRICE_UPDATES(cluster));
    }

    async handle(event: PriceUpdateEvent, channel: RedisChannel<PriceUpdateEvent>): Promise<void> {
        if (!isValidPrice(event.price_usd)) return;

        const network = event.network ?? clusterFromChannel(channel);

        try {
            const entity = this.priceEventRepository.create({
                tokenMint: event.mint,
                network,
                price: event.price_usd,
                slot: String(event.slot),
                timestamp: String(Math.floor(Date.now() / 1000)),
                source: event.source || "UNKNOWN",
                eventType: "PRICE_UPDATE"
            });

            await this.priceEventRepository.createQueryBuilder().insert().into(MarketPriceEvent).values(entity).execute();
        } catch (error) {
            logError(this.logger, `Failed to persist price update for ${network}:${event.mint}`, error);
        }
    }
}

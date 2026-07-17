import { CLUSTERS, requireCluster } from "../common/cluster/cluster.types";
import type { Cluster } from "../common/cluster/cluster.types";
import type { HolderUpdateEvent, PriceUpdateEvent } from "../modules/tokens/types/holder-aggregation.types";
import type { SwapEvent } from "../modules/tokens/types/swap-event.types";
import type { PaymentTransferEvent } from "../modules/billing/types/payment-transfer-event.types";
import { channel } from "./utils/redisChannels";

export const REDIS_CHANNELS = {
    TRADE_EVENTS: channel<SwapEvent>()((network: Cluster) => `solsight:trade_events:${network}`),
    HOLDER_UPDATES: channel<HolderUpdateEvent>()((network: Cluster) => `solsight:holder_updates:${network}`),
    PRICE_UPDATES: channel<PriceUpdateEvent>()((network: Cluster) => `solsight:price_updates:${network}`),
    HOLDER_RESPONSES: channel<unknown>()((network: Cluster) => `solsight:holder_responses:${network}`),
    PAYMENT_TRANSFERS: channel<PaymentTransferEvent>()((n: Cluster) => `solsight:payment_transfers:${n}`)
} as const;

export function isTradeEventChannel(channelName: string): channelName is ReturnType<(typeof REDIS_CHANNELS)["TRADE_EVENTS"]> {
    return CLUSTERS.some((cluster) => REDIS_CHANNELS.TRADE_EVENTS(cluster) === channelName);
}

export function clusterFromChannel(channelName: string): Cluster {
    return requireCluster(channelName.split(":").pop(), `Redis channel ${channelName}`);
}

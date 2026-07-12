import { Injectable } from "@nestjs/common";
import { CLUSTERS } from "../../../common/cluster/cluster.types";
import type { EventHandler } from "../../../redis/event-handler";
import { REDIS_CHANNELS, clusterFromChannel } from "../../../redis/channels";
import type { RedisChannel } from "../../../redis/utils/redisChannels";
import { WalletAlertCheckerService } from "../wallet-alert-checker.service";
import type { SwapEvent } from "../../tokens/types/swap-event.types";
import type { HolderUpdateEvent } from "../../tokens/types/holder-aggregation.types";
import type { PaymentTransferEvent } from "../../billing/types/payment-transfer-event.types";

type WalletTrackerPayload = SwapEvent | HolderUpdateEvent | PaymentTransferEvent;

@Injectable()
export class WalletTrackerHandler implements EventHandler<WalletTrackerPayload> {
    readonly name = WalletTrackerHandler.name;

    constructor(private readonly walletAlertCheckerService: WalletAlertCheckerService) {}

    channels(): RedisChannel<WalletTrackerPayload>[] {
        return [
            ...CLUSTERS.map((c) => REDIS_CHANNELS.TRADE_EVENTS(c)),
            ...CLUSTERS.map((c) => REDIS_CHANNELS.HOLDER_UPDATES(c)),
            ...CLUSTERS.map((c) => REDIS_CHANNELS.PAYMENT_TRANSFERS(c))
        ] as RedisChannel<WalletTrackerPayload>[];
    }

    async handle(event: WalletTrackerPayload, channel: RedisChannel<WalletTrackerPayload>): Promise<void> {
        const channelStr = channel as string;
        if (channelStr.startsWith("solsight:trade_events:")) {
            const swap = event as SwapEvent;
            if (!swap.maker) return;
            await this.walletAlertCheckerService.handleSwapEvent({ ...swap, network: swap.network ?? clusterFromChannel(channelStr) });
        } else if (channelStr.startsWith("solsight:holder_updates:")) {
            const update = event as HolderUpdateEvent;
            if (!update.wallet) return;
            await this.walletAlertCheckerService.handleHolderUpdateEvent({ ...update, network: update.network ?? clusterFromChannel(channelStr) });
        } else if (channelStr.startsWith("solsight:payment_transfers:")) {
            const transfer = event as PaymentTransferEvent;
            if (!transfer.from_wallet) return;
            await this.walletAlertCheckerService.handlePaymentTransferEvent({ ...transfer, network: transfer.network ?? clusterFromChannel(channelStr) });
        }
    }
}

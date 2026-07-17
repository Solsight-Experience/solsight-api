import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CLUSTERS } from "../../../common/cluster/cluster.types";
import type { EventHandler } from "../../../redis/event-handler";
import { REDIS_CHANNELS, clusterFromChannel } from "../../../redis/channels";
import type { RedisChannel } from "../../../redis/utils/redisChannels";
import { PaymentService } from "../services/payment.service";
import { parseOrderIdFromMemo } from "../constants/memo.constant";
import type { PaymentTransferEvent } from "../types/payment-transfer-event.types";

@Injectable()
export class PaymentTransferHandler implements EventHandler<PaymentTransferEvent> {
    readonly name = PaymentTransferHandler.name;
    private readonly logger = new Logger(PaymentTransferHandler.name);

    constructor(
        private readonly paymentService: PaymentService,
        private readonly configService: ConfigService
    ) {}

    channels(): RedisChannel<PaymentTransferEvent>[] {
        return CLUSTERS.map((c) => REDIS_CHANNELS.PAYMENT_TRANSFERS(c));
    }

    async handle(event: PaymentTransferEvent, channel: RedisChannel<PaymentTransferEvent>): Promise<void> {
        const merchantWallet = this.configService.get<string>("billing.merchantWallet");
        if (!merchantWallet || event.to_wallet !== merchantWallet) return;

        const cluster = event.network ?? clusterFromChannel(channel as string);
        const memo = event.memo;
        if (!memo) {
            this.logger.debug(`PaymentTransfer sig=${event.signature} cluster=${cluster}: no memo, skipping`);
            return;
        }

        const orderId = parseOrderIdFromMemo(memo);
        if (!orderId) {
            this.logger.debug(`PaymentTransfer sig=${event.signature} cluster=${cluster}: memo="${memo}" does not match PAY:<orderId>`);
            return;
        }

        try {
            const result = await this.paymentService.completeOrder(orderId, event.signature);
            if (result.alreadyProcessed) {
                this.logger.debug(`PaymentTransfer sig=${event.signature}: order=${orderId} already processed`);
            } else {
                this.logger.log(`PaymentTransfer sig=${event.signature}: completed order=${orderId} credits=${result.credits}`);
            }
        } catch (err) {
            this.logger.error(`PaymentTransfer sig=${event.signature}: failed to complete order=${orderId}`, err);
        }
    }
}

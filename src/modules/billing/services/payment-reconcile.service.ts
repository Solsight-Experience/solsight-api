import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PaymentOrder, PaymentOrderStatus } from "../entities/payment-order.entity";

@Injectable()
export class PaymentReconcileService {
    private readonly logger = new Logger(PaymentReconcileService.name);

    constructor(
        @InjectRepository(PaymentOrder)
        private readonly paymentOrderRepository: Repository<PaymentOrder>
    ) {}

    // Đánh dấu hết hạn các order PENDING quá "expiresAt".
    @Cron(CronExpression.EVERY_MINUTE)
    async reconcile(): Promise<void> {
        await this.expirePendingOrders();
    }

    private async expirePendingOrders(): Promise<void> {
        await this.paymentOrderRepository.query(`UPDATE payment_orders SET "status" = $1 WHERE "status" = $2 AND "expiresAt" < NOW()`, [
            PaymentOrderStatus.EXPIRED,
            PaymentOrderStatus.PENDING
        ]);
    }
}

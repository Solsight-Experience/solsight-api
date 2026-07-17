import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SolanaModule } from "../../infra/solana/solana.module";
import { RedisModule } from "../../redis/redis.module";
import { UserCredit } from "./entities/user-credit.entity";
import { FeatureUsage } from "./entities/feature-usage.entity";
import { PaymentOrder } from "./entities/payment-order.entity";
import { QuotaController } from "./controllers/quota.controller";
import { QuotaService } from "./services/quota.service";
import { PaymentController } from "./controllers/payment.controller";
import { PaymentService } from "./services/payment.service";
import { PaymentReconcileService } from "./services/payment-reconcile.service";
import { PaymentTransferHandler } from "./handlers/payment-transfer.handler";

@Module({
    imports: [TypeOrmModule.forFeature([UserCredit, FeatureUsage, PaymentOrder]), ConfigModule, SolanaModule, RedisModule],
    controllers: [QuotaController, PaymentController],
    providers: [QuotaService, PaymentService, PaymentReconcileService, PaymentTransferHandler],
    exports: [QuotaService, PaymentService]
})
export class BillingModule {}

import { Module } from "@nestjs/common";
import { LimitOrderController } from "./controllers/limit-order.controller";
import { LimitOrderService } from "./services/limit-order.service";
import { JupiterModule } from "../../infra/jupiter/jupiter.module";

@Module({
    imports: [JupiterModule],
    controllers: [LimitOrderController],
    providers: [LimitOrderService],
    exports: [LimitOrderService]
})
export class LimitOrderModule {}

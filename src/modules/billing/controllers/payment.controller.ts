import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";
import { PaymentService } from "../services/payment.service";
import { CreateOrderDto } from "../dtos/create-order.dto";
import { RefreshPaymentTransactionDto } from "../dtos/refresh-payment-transaction.dto";
import { SubmitPaymentDto } from "../dtos/submit-payment.dto";
import { PACKAGES } from "../constants/packages.constant";

@Controller("billing/payment")
export class PaymentController {
    constructor(private readonly paymentService: PaymentService) {}

    @Get("packages")
    getPackages() {
        return Object.values(PACKAGES).map(({ code, credits, lamports }) => ({ code, credits, lamports: lamports.toString() }));
    }

    @Post("orders")
    @UseGuards(JwtAuthGuard)
    async createOrder(@CurrentUser() user: CurrentUserPayload, @RequestCluster() cluster: Cluster, @Body() dto: CreateOrderDto) {
        return this.paymentService.createOrder(user.id, cluster, dto);
    }

    @Post("orders/:id/refresh-tx")
    @UseGuards(JwtAuthGuard)
    async refreshTransaction(
        @CurrentUser() user: CurrentUserPayload,
        @RequestCluster() cluster: Cluster,
        @Param("id") id: string,
        @Body() dto: RefreshPaymentTransactionDto
    ) {
        return this.paymentService.refreshTransaction(user.id, cluster, id, dto.walletAddress);
    }

    @Post("orders/:id/submit")
    @UseGuards(JwtAuthGuard)
    async submitPayment(@CurrentUser() user: CurrentUserPayload, @RequestCluster() cluster: Cluster, @Param("id") id: string, @Body() dto: SubmitPaymentDto) {
        return this.paymentService.submitPayment(user.id, cluster, id, dto);
    }

    @Get("orders")
    @UseGuards(JwtAuthGuard)
    async listOrders(@CurrentUser() user: CurrentUserPayload, @Query("page") page?: string, @Query("limit") limit?: string) {
        return this.paymentService.listOrders(user.id, page ? parseInt(page, 10) : undefined, limit ? parseInt(limit, 10) : undefined);
    }
}

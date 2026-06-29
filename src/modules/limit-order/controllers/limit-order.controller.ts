import { Controller, Post, Get, Body, Query, UseGuards } from "@nestjs/common";
import { LimitOrderService } from "../services/limit-order.service";
import { CreateOrderDto, CancelOrderDto, CancelOrdersDto, GetOrdersDto, ExecuteOrderDto } from "../dtos";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Controller("limit-orders")
@UseGuards(JwtAuthGuard)
export class LimitOrderController {
    constructor(private readonly limitOrderService: LimitOrderService) {}

    /**
     * Create a new limit order
     * @param createOrderDto - Order creation parameters
     * @returns Order creation result with transaction to sign
     */
    @Post("create")
    async createOrder(@RequestCluster() cluster: Cluster, @Body() createOrderDto: CreateOrderDto) {
        return this.limitOrderService.createOrder(cluster, createOrderDto);
    }

    /**
     * Cancel a single limit order
     * @param cancelOrderDto - Order cancellation parameters
     * @returns Cancellation transaction to sign
     */
    @Post("cancel")
    async cancelOrder(@RequestCluster() cluster: Cluster, @Body() cancelOrderDto: CancelOrderDto) {
        return this.limitOrderService.cancelOrder(cluster, cancelOrderDto);
    }

    /**
     * Cancel multiple limit orders (or all if no orders specified)
     * @param cancelOrdersDto - Orders cancellation parameters
     * @returns Cancellation transactions to sign (batched in groups of 5)
     */
    @Post("cancel-multiple")
    async cancelOrders(@RequestCluster() cluster: Cluster, @Body() cancelOrdersDto: CancelOrdersDto) {
        return this.limitOrderService.cancelOrders(cluster, cancelOrdersDto);
    }

    /**
     * Get limit orders for a user
     * @param getOrdersDto - Query parameters for filtering orders
     * @returns List of orders (paginated, 10 per page)
     */
    @Get()
    async getOrders(@RequestCluster() cluster: Cluster, @Query() getOrdersDto: GetOrdersDto) {
        return this.limitOrderService.getOrders(cluster, getOrdersDto);
    }

    /**
     * Execute a signed limit order transaction
     * @param executeOrderDto - Execution parameters
     * @returns Transaction signature
     */
    @Post("execute")
    async executeOrder(@RequestCluster() cluster: Cluster, @Body() executeOrderDto: ExecuteOrderDto) {
        return this.limitOrderService.executeOrder(cluster, executeOrderDto);
    }
}

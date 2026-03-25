import { Controller, Post, Get, Body, Query, UseGuards } from "@nestjs/common";
import { LimitOrderService } from "../services/limit-order.service";
import { CreateOrderDto, CancelOrderDto, CancelOrdersDto, GetOrdersDto, ExecuteOrderDto } from "../dtos";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";

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
    async createOrder(@Body() createOrderDto: CreateOrderDto) {
        return this.limitOrderService.createOrder(createOrderDto);
    }

    /**
     * Cancel a single limit order
     * @param cancelOrderDto - Order cancellation parameters
     * @returns Cancellation transaction to sign
     */
    @Post("cancel")
    async cancelOrder(@Body() cancelOrderDto: CancelOrderDto) {
        return this.limitOrderService.cancelOrder(cancelOrderDto);
    }

    /**
     * Cancel multiple limit orders (or all if no orders specified)
     * @param cancelOrdersDto - Orders cancellation parameters
     * @returns Cancellation transactions to sign (batched in groups of 5)
     */
    @Post("cancel-multiple")
    async cancelOrders(@Body() cancelOrdersDto: CancelOrdersDto) {
        return this.limitOrderService.cancelOrders(cancelOrdersDto);
    }

    /**
     * Get limit orders for a user
     * @param getOrdersDto - Query parameters for filtering orders
     * @returns List of orders (paginated, 10 per page)
     */
    @Get()
    async getOrders(@Query() getOrdersDto: GetOrdersDto) {
        return this.limitOrderService.getOrders(getOrdersDto);
    }

    /**
     * Execute a signed limit order transaction
     * @param executeOrderDto - Execution parameters
     * @returns Transaction signature
     */
    @Post("execute")
    async executeOrder(@Body() executeOrderDto: ExecuteOrderDto) {
        return this.limitOrderService.executeOrder(executeOrderDto);
    }
}

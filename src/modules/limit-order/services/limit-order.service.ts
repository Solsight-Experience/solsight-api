import { Injectable, Logger } from "@nestjs/common";
import { JupiterService } from "../../../infra/jupiter/jupiter.service";
import { CreateOrderDto, CancelOrderDto, CancelOrdersDto, GetOrdersDto, ExecuteOrderDto } from "../dtos";

@Injectable()
export class LimitOrderService {
    private readonly logger = new Logger(LimitOrderService.name);

    constructor(private readonly jupiterService: JupiterService) {}

    /**
     * Create a limit order
     */
    async createOrder(createOrderDto: CreateOrderDto) {
        try {
            const params = {
                inputMint: createOrderDto.inputMint,
                outputMint: createOrderDto.outputMint,
                maker: createOrderDto.maker,
                payer: createOrderDto.payer,
                params: {
                    makingAmount: createOrderDto.params.makingAmount,
                    takingAmount: createOrderDto.params.takingAmount,
                    slippageBps: createOrderDto.params.slippageBps,
                    expiredAt: createOrderDto.params.expiredAt,
                    feeBps: createOrderDto.params.feeBps
                },
                computeUnitPrice: createOrderDto.computeUnitPrice || "auto",
                feeAccount: createOrderDto.feeAccount,
                wrapAndUnwrapSol: createOrderDto.wrapAndUnwrapSol ?? true
            };

            this.logger.log(`Creating limit order: ${createOrderDto.inputMint} -> ${createOrderDto.outputMint}`);

            const result = await this.jupiterService.createOrder(params);

            return {
                success: true,
                data: result
            };
        } catch (error) {
            this.logger.error("Error creating limit order", error);
            throw error;
        }
    }

    /**
     * Cancel a single limit order
     */
    async cancelOrder(cancelOrderDto: CancelOrderDto) {
        try {
            this.logger.log(`Canceling order: ${cancelOrderDto.order}`);

            const result = await this.jupiterService.cancelOrder({
                maker: cancelOrderDto.maker,
                order: cancelOrderDto.order,
                computeUnitPrice: cancelOrderDto.computeUnitPrice || "auto"
            });

            return {
                success: true,
                data: result
            };
        } catch (error) {
            this.logger.error("Error canceling limit order", error);
            throw error;
        }
    }

    /**
     * Cancel multiple limit orders
     */
    async cancelOrders(cancelOrdersDto: CancelOrdersDto) {
        try {
            this.logger.log(`Canceling ${cancelOrdersDto.orders?.length || "all"} orders`);

            const result = await this.jupiterService.cancelOrders(cancelOrdersDto.maker, cancelOrdersDto.orders, cancelOrdersDto.computeUnitPrice || "auto");

            return {
                success: true,
                data: result
            };
        } catch (error) {
            this.logger.error("Error canceling limit orders", error);
            throw error;
        }
    }

    /**
     * Get limit orders (active or history)
     */
    async getOrders(getOrdersDto: GetOrdersDto) {
        try {
            this.logger.log(`Getting ${getOrdersDto.orderStatus} orders for user: ${getOrdersDto.user}`);

            const result = await this.jupiterService.getTriggerOrders(
                getOrdersDto.user,
                getOrdersDto.orderStatus,
                getOrdersDto.inputMint,
                getOrdersDto.outputMint,
                getOrdersDto.page || 1,
                getOrdersDto.includeFailedTx
            );

            return {
                success: true,
                data: result
            };
        } catch (error) {
            this.logger.error("Error getting limit orders", error);
            throw error;
        }
    }

    /**
     * Execute a limit order
     */
    async executeOrder(executeOrderDto: ExecuteOrderDto) {
        try {
            this.logger.log(`Executing order with requestId: ${executeOrderDto.requestId}`);

            const result = await this.jupiterService.executeOrder({
                requestId: executeOrderDto.requestId,
                signedTransaction: executeOrderDto.signedTransaction
            });

            return {
                success: true,
                data: result
            };
        } catch (error) {
            this.logger.error("Error executing limit order", error);
            throw error;
        }
    }
}

import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { SwapService } from "../services/swap.service";
import { GetQuoteDto } from "../dtos/get-quote.dto";
import { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";
import { ExecuteSwapDto } from "../dtos/execute-swap.dto";

@Controller("swap")
export class SwapController {
    constructor(private readonly swapService: SwapService) {}

    @Get("quote")
    async getQuote(@Query() dto: GetQuoteDto) {
        return this.swapService.getQuote(dto);
    }

    @Post("transaction")
    async getSwapTransaction(@Body() dto: GetSwapTransactionDto) {
        return this.swapService.getSwapTransaction(dto);
    }

    @Post("execute")
    async executeSwap(@Body() dto: ExecuteSwapDto) {
        return this.swapService.executeSwap(dto);
    }

    @Get("sol-price")
    async getSolPrice() {
        return this.swapService.getSolPrice();
    }

    @Get("token-info/:mint")
    async getTokenInfo(@Param("mint") mint: string) {
        return this.swapService.getTokenInfo(mint);
    }
}

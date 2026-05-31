import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { SwapService } from "../services/swap.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { GetQuoteDto } from "../dtos/get-quote.dto";
import { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";
import { ExecuteSwapDto } from "../dtos/execute-swap.dto";
import { GetSwapInfoDto } from "../dtos/get-swap-info.dto";

@Controller("swap")
export class SwapController {
    constructor(private readonly swapService: SwapService) {}

    @UseGuards(JwtAuthGuard)
    @Get("quote")
    async getQuote(@Query() dto: GetQuoteDto) {
        return this.swapService.getQuote(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Post("transaction")
    async getSwapTransaction(@Body() dto: GetSwapTransactionDto) {
        return this.swapService.getSwapTransaction(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Post("execute")
    async executeSwap(@Body() dto: ExecuteSwapDto) {
        return this.swapService.executeSwap(dto);
    }

    @UseGuards(JwtAuthGuard)
    @Get("info")
    async getSwapInfo(@Query() dto: GetSwapInfoDto) {
        return this.swapService.getSwapInfo(dto);
    }
}

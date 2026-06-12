import { Body, Controller, Get, Param, Post, Query, Request, UseGuards } from "@nestjs/common";
import { SwapService } from "../services/swap.service";
import { GetQuoteDto } from "../dtos/get-quote.dto";
import { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";
import { ExecuteSwapDto } from "../dtos/execute-swap.dto";
import { GetSwapInfoDto } from "../dtos/get-swap-info.dto";
import { OptionalJwtAuthGuard } from "../../../common/guards/optional-jwt-auth.guard";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";

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
    @UseGuards(OptionalJwtAuthGuard)
    async executeSwap(@Body() dto: ExecuteSwapDto, @Request() req: { user?: { id?: string } }) {
        return this.swapService.executeSwap(dto, req.user?.id ?? null);
    }

    @Get("sol-price")
    async getSolPrice() {
        return this.swapService.getSolPrice();
    }

    @Get("token-info/:mint")
    async getTokenInfo(@Param("mint") mint: string) {
        return this.swapService.getTokenInfo(mint);
    }

    @UseGuards(JwtAuthGuard)
    @Get("info")
    async getSwapInfo(@Query() dto: GetSwapInfoDto) {
        return this.swapService.getSwapInfo(dto);
    }
}

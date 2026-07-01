import { Body, Controller, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { SwapService } from "../services/swap.service";
import { GetQuoteDto } from "../dtos/get-quote.dto";
import { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";
import { ExecuteSwapDto } from "../dtos/execute-swap.dto";
import { GetSwapInfoDto } from "../dtos/get-swap-info.dto";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { SolanaService } from "../../../infra/solana/solana.service";

@Controller("swap")
export class SwapController {
    constructor(
        private readonly swapService: SwapService,
        private readonly solanaService: SolanaService
    ) {}

    @Get("quote")
    @UseGuards(JwtAuthGuard)
    async getQuote(@RequestCluster() cluster: Cluster, @Query() dto: GetQuoteDto) {
        return this.swapService.getQuote(cluster, dto);
    }

    @Post("transaction")
    @UseGuards(JwtAuthGuard)
    async getSwapTransaction(@RequestCluster() cluster: Cluster, @Body() dto: GetSwapTransactionDto) {
        return this.swapService.getSwapTransaction(cluster, dto);
    }

    @Post("execute")
    @UseGuards(JwtAuthGuard)
    async executeSwap(@RequestCluster() cluster: Cluster, @Body() dto: ExecuteSwapDto, @Request() req: { user?: { id?: string } }) {
        return this.swapService.executeSwap(cluster, dto, req.user?.id ?? null);
    }

    @Get("sol-price")
    async getSolPrice(@RequestCluster() cluster: Cluster) {
        return this.swapService.getSolPrice(cluster);
    }

    @Get("token-info/:mint")
    async getTokenInfo(@RequestCluster() cluster: Cluster, @Param("mint") mint: string) {
        const decimals = await this.solanaService.getMintDecimals(cluster, mint);
        return decimals == null ? null : { decimals };
    }

    @Get("info")
    async getSwapInfo(@RequestCluster() cluster: Cluster, @Query() dto: GetSwapInfoDto) {
        return this.swapService.getSwapInfo(cluster, dto);
    }
}

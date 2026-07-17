import { Controller, Get, Param, NotFoundException, Query, Body, Post } from "@nestjs/common";
import { TokensService } from "../services/tokens.service";
import { TokenSummaryService } from "../services/token-summary.service";
import { SummarizeTokenRequestDto, TokenSummaryResponseDto } from "../dtos/token-summary.dto";
import { TraderAggregationService } from "../services/aggregation/trader-aggregation.service";
import { ChartQueryDto } from "../dtos/token.chart.dto";
import { TradesQueryDto } from "../dtos/token.trades.dto";
import { TokenFilterConditionDto } from "../dtos/token.filter.dto";
import { TokenPriceService } from "../services/token-price.service";
import { COMMON_TOKEN_MINT } from "../constants/token.constant";
import { SolPriceResponseDto } from "../dtos/sol-price.response.dto";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";

@Controller("tokens")
export class TokensController {
    constructor(
        private readonly tokensService: TokensService,
        private readonly tokenPriceService: TokenPriceService,
        private readonly tokenSummaryService: TokenSummaryService,
        private readonly traderAggregationService: TraderAggregationService
    ) {}

    @Get("search")
    search(@RequestCluster() cluster: Cluster, @Query("q") q: string, @Query("limit") limit: number = 10) {
        return this.tokensService.search(cluster, q, limit);
    }

    @Post("filter")
    filter(
        @RequestCluster() cluster: Cluster,
        @Query("sort_by") sort_by: string,
        @Query("sort_order") sort_order: "asc" | "desc",
        @Query("limit") limit: number = 10,
        @Query("offset") offset: number = 0,
        @Body() filterDto: TokenFilterConditionDto
    ) {
        return this.tokensService.filter(cluster, filterDto, limit, sort_by, sort_order, offset);
    }

    @Get("sol-price")
    async getSolPrice(@RequestCluster() cluster: Cluster): Promise<SolPriceResponseDto> {
        const result = await this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL);
        return { price_usd: result.priceUsd, source: result.source === "redis" ? "redis" : "coingecko" };
    }

    @Get(":address/chart")
    getChart(@RequestCluster() cluster: Cluster, @Param("address") address: string, @Query() query: ChartQueryDto) {
        return this.tokensService.getChartData(cluster, address, query);
    }

    @Get(":address/trades")
    getTrades(@RequestCluster() cluster: Cluster, @Param("address") address: string, @Query() query: TradesQueryDto) {
        return this.tokensService.getTrades(cluster, address, query.limit ?? 50);
    }

    @Get(":address/top-traders")
    getTopTraders(@RequestCluster() cluster: Cluster, @Param("address") address: string) {
        return this.traderAggregationService.getTopTraders(cluster, address, 10);
    }

    @Get(":address/holders")
    getHolders(@RequestCluster() cluster: Cluster, @Param("address") address: string, @Query("limit") limit: number = 50) {
        return this.tokensService.getHolders(cluster, address, Math.min(Number(limit) || 50, 500));
    }

    @Get(":address/holders/:wallet/pnl-chart")
    getHolderPnlChart(
        @RequestCluster() cluster: Cluster,
        @Param("address") address: string,
        @Param("wallet") wallet: string,
        @Query("time_frame") timeFrame = "30D",
        @Query("interval") interval = "1d"
    ) {
        return this.tokensService.getHolderPnlChart(cluster, address, wallet, timeFrame, interval);
    }

    @Get(":address")
    async findOne(@RequestCluster() cluster: Cluster, @Param("address") address: string) {
        const data = await this.tokensService.findOne(cluster, address);
        if (data) return data;
        else throw new NotFoundException("Token not found");
    }

    @Post("summarize")
    async summarize(@RequestCluster() cluster: Cluster, @Body() dto: SummarizeTokenRequestDto): Promise<TokenSummaryResponseDto> {
        const result = await this.tokenSummaryService.generateSummary(cluster, {
            address: dto.address,
            name: dto.name,
            symbol: dto.symbol
        });

        return result;
    }
}

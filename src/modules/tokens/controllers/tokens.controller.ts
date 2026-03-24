import { Controller, Get, Param, NotFoundException, Query, Body, Post } from "@nestjs/common";
import { TokensService } from "../services/tokens.service";
import { TokenSummaryService } from "../services/token-summary.service";
import { SummarizeTokenRequestDto, TokenSummaryResponseDto } from "../dtos/token-summary.dto";
import { HolderAggregationService } from "../services/aggregation/holder-aggregation.service";
import { TraderAggregationService } from "../services/aggregation/trader-aggregation.service";
import { OhlcAggregationService } from "../services/aggregation/ohlc-aggregation.service";
import { ChartQueryDto } from "../dtos/token.chart.dto";

@Controller("tokens")
export class TokensController {
    constructor(
        private readonly tokensService: TokensService,
        private readonly tokenSummaryService: TokenSummaryService,
        private readonly holderAggregationService: HolderAggregationService,
        private readonly traderAggregationService: TraderAggregationService,
        private readonly ohlcAggregationService: OhlcAggregationService
    ) {}

    @Get("search")
    search(@Query("q") q: string, @Query("limit") limit: number = 10) {
        return this.tokensService.search(q, limit);
    }

    @Post("filter")
    filter(
        @Query("sort_by") sort_by: string,
        @Query("sort_order") sort_order: "asc" | "desc",
        @Query("limit") limit: number = 10,
        @Query("offset") offset: number = 0,
        @Body() filterDto: any
    ) {
        return this.tokensService.filter(filterDto, limit, sort_by, sort_order, offset);
    }

    @Get(":address/chart")
    getChart(@Param("address") address: string, @Query() query: ChartQueryDto) {
        return this.tokensService.getChartData(address, query);
    }

    @Post("summarize")
    async summarize(@Body() dto: SummarizeTokenRequestDto): Promise<TokenSummaryResponseDto> {
        const result = await this.tokenSummaryService.generateSummary(dto.address, {
            includePriceAnalysis: dto.includePriceAnalysis,
            includeRiskAssessment: dto.includeRiskAssessment,
            includeTradingMetrics: dto.includeTradingMetrics,
            includeMarketComparison: dto.includeMarketComparison,
            includeSocialSentiment: dto.includeSocialSentiment,
            forceRefresh: dto.forceRefresh
        });

        return result;
    }

    @Get(":address/holders")
    async getHolders(
        @Param("address") address: string,
        @Query("limit") limit: number = 100,
        @Query("offset") offset: number = 0,
        @Query("sort_by") sortBy?: string
    ) {
        const holders = await this.holderAggregationService.getTopHolders(address, limit);
        return {
            holders,
            total: holders.length
        };
    }

    @Get(":address/top-traders")
    async getTopTraders(@Param("address") address: string, @Query("limit") limit: number = 10, @Query("time_frame") timeFrame?: string) {
        const traders = await this.traderAggregationService.getTopTraders(address, limit);
        return {
            traders,
            total: traders.length
        };
    }

    @Get(":address/trades")
    async getTrades(@Param("address") address: string, @Query("limit") limit: number = 50, @Query("offset") offset: number = 0, @Query("type") type?: string) {
        // TODO: Implement trades retrieval from Redis or database
        return {
            trades: [],
            total: 0
        };
    }

    // @Get(":address/chart")
    // async getChart(
    //     @Param("address") address: string,
    //     @Query("interval") interval: string = "1m",
    //     @Query("limit") limit: number = 500,
    //     @Query("from") from?: number,
    //     @Query("to") to?: number
    // ) {
    //     const points = await this.ohlcAggregationService.getOhlcData(address, interval, limit);
    //     return {
    //         points,
    //         interval
    //     };
    // }

    @Get(":address")
    findOne(@Param("address") address: string) {
        const data = this.tokensService.findOne(address);
        if (data) return data;
        else throw new NotFoundException("Token not found");
    }
}

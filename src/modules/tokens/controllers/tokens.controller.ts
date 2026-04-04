import { Controller, Get, Param, NotFoundException, Query, Body, Post } from "@nestjs/common";
import { TokensService } from "../services/tokens.service";
import { TokenSummaryService } from "../services/token-summary.service";
import { SummarizeTokenRequestDto, TokenSummaryResponseDto } from "../dtos/token-summary.dto";
import { HolderAggregationService } from "../services/aggregation/holder-aggregation.service";
import { TraderAggregationService } from "../services/aggregation/trader-aggregation.service";
import { OhlcAggregationService } from "../services/aggregation/ohlc-aggregation.service";
import { PoolsAggregationService } from "../services/aggregation/pools-aggregation.service";
import { ChartQueryDto } from "../dtos/token.chart.dto";

@Controller("tokens")
export class TokensController {
    constructor(
        private readonly tokensService: TokensService,
        private readonly tokenSummaryService: TokenSummaryService,
        private readonly poolsAggregationService: PoolsAggregationService
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

    @Get(":address/pools")
    async getTokenPools(@Param("address") address: string) {
        return this.poolsAggregationService.getPoolsForToken(address);
    }

    @Get(":address")
    findOne(@Param("address") address: string) {
        const data = this.tokensService.findOne(address);
        if (data) return data;
        else throw new NotFoundException("Token not found");
    }

    @Post("summarize")
    async summarize(@Body() dto: SummarizeTokenRequestDto): Promise<TokenSummaryResponseDto> {
        const result = await this.tokenSummaryService.generateSummary({
            address: dto.address,
            name: dto.name,
            symbol: dto.symbol
        });

        return result;
    }
}

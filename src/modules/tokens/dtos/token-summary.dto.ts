import { IsString, IsBoolean, IsOptional } from "class-validator";

export class SummarizeTokenRequestDto {
    @IsString()
    address: string;

    @IsOptional()
    @IsBoolean()
    includePriceAnalysis?: boolean;

    @IsOptional()
    @IsBoolean()
    includeRiskAssessment?: boolean;

    @IsOptional()
    @IsBoolean()
    includeTradingMetrics?: boolean;

    @IsOptional()
    @IsBoolean()
    includeMarketComparison?: boolean;

    @IsOptional()
    @IsBoolean()
    includeSocialSentiment?: boolean;

    @IsOptional()
    @IsBoolean()
    forceRefresh?: boolean;
}

export class TokenSummaryResponseDto {
    address: string;
    summary: string;
    generatedAt: Date;
    model: string;
    cached: boolean;
    tokenData?: {
        name: string;
        symbol: string;
        price: number;
        priceChange24h: number;
    };
}

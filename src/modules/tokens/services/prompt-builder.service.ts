import { Injectable, Logger } from '@nestjs/common';
import { Token } from '../entities/token.entity';

export interface SummaryOptions {
  includePriceAnalysis?: boolean;
  includeRiskAssessment?: boolean;
  includeTradingMetrics?: boolean;
  includeMarketComparison?: boolean;
  includeSocialSentiment?: boolean;
}

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  /**
   * Build a comprehensive prompt for AI token summarization
   * @param token - Token entity with full data
   * @param categoryTokens - Other tokens in the same category for comparison
   * @param options - What to include in the summary
   * @returns Structured prompt for AI
   */
  buildSummaryPrompt(
    token: Token,
    categoryTokens?: Token[],
    options: SummaryOptions = {},
  ): string {
    const {
      includePriceAnalysis = true,
      includeRiskAssessment = true,
      includeTradingMetrics = true,
      includeMarketComparison = true,
      includeSocialSentiment = true,
    } = options;

    const sections: string[] = [];

    // Core token data
    sections.push(
      `You are a professional on-chain crypto risk analyst. Your task is to analyze a token strictly based on the structured data provided. Analyze this Solana token and provide a concise summary in English.`,
    );
    sections.push(`\n**Token:** ${token.name} (${token.symbol})`);
    sections.push(`**Category:** ${token.category?.name || 'Unknown'}`);
    sections.push(`**Age:** ${this.formatAge(token.ageSeconds)}`);

    // Price data
    if (includePriceAnalysis) {
      sections.push(`\n**Price:** $${this.formatNumber(token.price)}`);
      sections.push(
        `**Changes:** 1h: ${this.formatPercentage(token.priceChange1h)}, 24h: ${this.formatPercentage(token.priceChange24h)}, 7d: ${this.formatPercentage(token.priceChange7d)}`,
      );
      sections.push(
        `**Market Cap:** $${this.formatLargeNumber(token.marketCap)}, **FDV:** $${this.formatLargeNumber(token.fdv)}`,
      );
      sections.push(
        `**Liquidity:** $${this.formatLargeNumber(token.liquidity)} (${this.formatPercentage(token.liquidityChange24h)} 24h)`,
      );
    }

    // Trading metrics
    if (includeTradingMetrics) {
      sections.push(
        `\n**Volume 24h:** $${this.formatLargeNumber(token.volume24h)} (${this.formatPercentage(token.volumeChange24h)})`,
      );
      sections.push(
        `**Transactions 24h:** ${this.formatNumber(token.txns24hTotal)} (Buys: ${token.txns24hBuys}, Sells: ${token.txns24hSells})`,
      );
      sections.push(
        `**Unique Wallets:** ${this.formatNumber(token.uniqueWallets24h)}`,
      );
    }

    // Holder & risk data
    sections.push(
      `\n**Holders:** ${this.formatNumber(token.holdersCount)} (Top 10: ${this.formatPercentage(token.top10Percent)})`,
    );

    if (includeRiskAssessment) {
      sections.push(`**Risk Score:** ${token.riskScore}/100`);
      sections.push(
        `**Security:** Mint ${token.mintAuthorityDisabled ? '✓' : '✗'}, Freeze ${token.freezeAuthorityDisabled ? '✓' : '✗'}, LP Burnt ${token.lpBurnt ? '✓' : '✗'}`,
      );
    }

    // Social presence
    if (includeSocialSentiment && token.website) {
      sections.push(`\n**Website:** ${token.website}`);
      sections.push(
        `**Social:** ${token.hasSocialLinks ? 'Active' : 'Limited'}`,
      );
    }

    // Market comparison
    if (
      includeMarketComparison &&
      categoryTokens &&
      categoryTokens.length > 0
    ) {
      const avgPrice = this.calculateAverage(
        categoryTokens.map((t) => Number(t.priceChange24h)),
      );
      sections.push(
        `\n**Category Avg 24h:** ${this.formatPercentage(avgPrice)}`,
      );
    }

    // Analysis instructions
    sections.push(`\n---`);
    sections.push(
      `\nProvide an English summary (max 250 words, 2-3 paragraphs):`,
    );
    sections.push(
      `1. Brief overview with key highlights (price trend, volume, activity)`,
    );
    sections.push(
      `2. Risk assessment (security, holders concentration, red flags if any)`,
    );
    sections.push(`3. Quick conclusion (bullish/bearish/neutral outlook)`);
    sections.push(
      `\nBe direct, factual, and concise. No elaborate explanations. Focus on actionable insights.`,
    );

    const prompt = sections.join('\n');
    this.logger.debug(`Built prompt with ${prompt.length} characters`);

    return prompt;
  }

  // Helper Methods

  private formatNumber(value: number | null | undefined): string {
    if (value === null || value === undefined) return '0';
    return Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 });
  }

  private formatLargeNumber(value: number | null | undefined): string {
    if (value === null || value === undefined) return '0';
    const num = Number(value);

    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`;
    return num.toFixed(2);
  }

  private formatPercentage(value: number | null | undefined): string {
    if (value === null || value === undefined) return '0%';
    const num = Number(value);
    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  }

  private formatChange(value: number | null | undefined): string {
    if (value === null || value === undefined) return '0';
    const num = Number(value);
    const sign = num >= 0 ? '+' : '';
    return `${sign}${this.formatNumber(num)}`;
  }

  private formatAge(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    if (days >= 365) return `${Math.floor(days / 365)} year(s)`;
    if (days >= 30) return `${Math.floor(days / 30)} month(s)`;
    if (days >= 1) return `${days} day(s)`;
    const hours = Math.floor(seconds / 3600);
    if (hours >= 1) return `${hours} hour(s)`;
    return `${Math.floor(seconds / 60)} minute(s)`;
  }

  private getRiskLevel(score: number): string {
    if (score >= 80) return 'Very High Risk';
    if (score >= 60) return 'High Risk';
    if (score >= 40) return 'Medium Risk';
    if (score >= 20) return 'Low Risk';
    return 'Very Low Risk';
  }

  private calculateBuySellRatio(buys: number, sells: number): string {
    if (sells === 0) return buys > 0 ? 'All buys' : 'No activity';
    const ratio = buys / sells;
    return `${ratio.toFixed(2)}:1 ${ratio > 1 ? '(Bullish)' : ratio < 1 ? '(Bearish)' : '(Neutral)'}`;
  }

  private analyzePriceTrend(sparkline: number[]): string {
    if (sparkline.length < 2) return 'Insufficient data';

    const first = sparkline[0];
    const last = sparkline[sparkline.length - 1];
    const change = ((last - first) / first) * 100;

    const trend =
      change > 5
        ? 'Strong uptrend'
        : change > 1
          ? 'Uptrend'
          : change > -1
            ? 'Sideways'
            : change > -5
              ? 'Downtrend'
              : 'Strong downtrend';

    return `${trend} (${this.formatPercentage(change)})`;
  }

  private calculateAverage(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
  }

  private compareToAverage(value: number, average: number): string {
    if (average === 0) return 'No comparison available';
    const diff = ((value - average) / average) * 100;
    const comparison = diff > 0 ? 'above' : 'below';
    return `${Math.abs(diff).toFixed(2)}% ${comparison} average`;
  }
}

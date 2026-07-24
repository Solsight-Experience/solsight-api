import { DailyReportChannel } from "../entities/daily-report-setting.entity";

export interface UpdateDailyReportSettingsParams {
    enabled: boolean;
    channels?: DailyReportChannel[];
    hourUtc?: number;
    minuteUtc?: number;
}

export interface ApplyLocalScheduleParams {
    enabled: boolean;
    channels?: DailyReportChannel[];
    hour?: number;
    minute?: number;
}

export interface PortfolioOverview {
    total_balance_usd: number;
    pnl: { total: number; roi_percent: number };
    top_tokens: { name: string; symbol: string; amount: number; value_usd: number; price?: { priceUsd: number } }[];
    allocation: { name: string; symbol: string; percentage: number }[];
}

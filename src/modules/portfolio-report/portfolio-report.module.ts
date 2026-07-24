import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DailyReportSetting } from "./entities/daily-report-setting.entity";
import { DailyReportSettingsService } from "./services/daily-report-settings.service";
import { PortfolioReportService } from "./services/portfolio-report.service";
import { PortfolioReportController } from "./controllers/portfolio-report.controller";
import { BotModule } from "../bot/bot.module";
import { EmailModule } from "../email/email.module";
import { PortfolioModule } from "../portfolio/portfolio.module";
import { GeminiModule } from "../../infra/gemini/gemini.module";

@Module({
    imports: [TypeOrmModule.forFeature([DailyReportSetting]), BotModule, EmailModule, PortfolioModule, GeminiModule],
    providers: [DailyReportSettingsService, PortfolioReportService],
    controllers: [PortfolioReportController],
    exports: [DailyReportSettingsService]
})
export class PortfolioReportModule {}

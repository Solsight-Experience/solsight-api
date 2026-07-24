import { Body, Controller, Get, Put, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";
import { DailyReportSettingsService } from "../services/daily-report-settings.service";
import { DailyReportSettingsResponseDto, UpdateDailyReportSettingsDto } from "../dtos/daily-report-settings.dto";
import { DailyReportChannel, DailyReportSetting } from "../entities/daily-report-setting.entity";

@Controller("daily-report")
@UseGuards(JwtAuthGuard)
export class PortfolioReportController {
    constructor(private readonly settingsService: DailyReportSettingsService) {}

    @Get("settings")
    async getSettings(@CurrentUser() user: CurrentUserPayload): Promise<DailyReportSettingsResponseDto> {
        const setting = await this.settingsService.getSettings(user.id);
        return this.toResponseDto(user.id, setting);
    }

    @Put("settings")
    async updateSettings(@CurrentUser() user: CurrentUserPayload, @Body() body: UpdateDailyReportSettingsDto): Promise<DailyReportSettingsResponseDto> {
        const setting = await this.settingsService.applyLocalSchedule(user.id, body);
        return this.toResponseDto(user.id, setting);
    }

    private async toResponseDto(userId: string, setting: DailyReportSetting | null): Promise<DailyReportSettingsResponseDto> {
        const [telegramConnected, emailConnected] = await Promise.all([
            this.settingsService.isChannelConnected(userId, DailyReportChannel.TELEGRAM),
            this.settingsService.isChannelConnected(userId, DailyReportChannel.EMAIL)
        ]);

        if (!setting) {
            return {
                enabled: false,
                channels: [],
                telegramConnected,
                emailConnected
            };
        }

        return {
            enabled: setting.enabled,
            channels: setting.channels,
            hour: setting.hourUtc ?? undefined,
            minute: setting.minuteUtc ?? undefined,
            telegramConnected,
            emailConnected
        };
    }
}

import { ArrayNotEmpty, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { DailyReportChannel } from "../entities/daily-report-setting.entity";

export class UpdateDailyReportSettingsDto {
    @IsBoolean()
    enabled: boolean;

    @IsOptional()
    @IsArray()
    @ArrayNotEmpty()
    @IsEnum(DailyReportChannel, { each: true })
    channels?: DailyReportChannel[];

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(23)
    hour?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    @Max(59)
    minute?: number;
}

export class DailyReportSettingsResponseDto {
    enabled: boolean;
    channels: DailyReportChannel[];
    hour?: number;
    minute?: number;
    telegramConnected: boolean;
    emailConnected: boolean;
}

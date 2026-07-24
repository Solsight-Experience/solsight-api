import { BadRequestException, Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { DailyReportSetting, DailyReportChannel } from "../entities/daily-report-setting.entity";
import { BotService } from "../../bot/services/bot.service";
import { EmailSubscriptionService } from "../../email/services/email-subscription.service";

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

@Injectable()
export class DailyReportSettingsService {
    constructor(
        @InjectRepository(DailyReportSetting)
        private readonly repo: Repository<DailyReportSetting>,
        private readonly botService: BotService,
        private readonly emailSubscriptionService: EmailSubscriptionService
    ) {}

    async getSettings(userId: string): Promise<DailyReportSetting | null> {
        return this.repo.findOneBy({ userId });
    }

    async updateSettings(userId: string, params: UpdateDailyReportSettingsParams): Promise<DailyReportSetting> {
        const channels = params.channels && params.channels.length > 0 ? [...new Set(params.channels)] : [DailyReportChannel.TELEGRAM];

        if (params.enabled) {
            if (params.hourUtc === undefined || params.minuteUtc === undefined) {
                throw new BadRequestException("hourUtc and minuteUtc are required to enable the daily report");
            }
            await this.assertChannelsConnected(userId, channels);
        }

        const existing = await this.repo.findOneBy({ userId });
        const toSave =
            existing ??
            this.repo.create({
                userId
            });

        toSave.enabled = params.enabled;
        toSave.channels = channels;
        if (params.hourUtc !== undefined) toSave.hourUtc = params.hourUtc;
        if (params.minuteUtc !== undefined) toSave.minuteUtc = params.minuteUtc;

        return this.repo.save(toSave);
    }

    /**
     * Validates a user-facing hour/minute (UTC, no timezone conversion) and applies it.
     * Shared by the `configure_daily_report` chat tool and the REST settings endpoint so the
     * validation rules only live in one place.
     */
    async applyLocalSchedule(userId: string, input: ApplyLocalScheduleParams): Promise<DailyReportSetting> {
        const channels = input.channels;

        if (!input.enabled) {
            return this.updateSettings(userId, { enabled: false, channels });
        }

        if (input.hour === undefined || !Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
            throw new BadRequestException("A valid hour (0-23) is required to enable the daily report");
        }
        const minute = input.minute ?? 0;
        if (!Number.isInteger(minute) || minute < 0 || minute > 59) {
            throw new BadRequestException("minute must be between 0 and 59");
        }

        return this.updateSettings(userId, {
            enabled: true,
            channels,
            hourUtc: input.hour,
            minuteUtc: minute
        });
    }

    async getDueSettings(hourUtc: number, minuteUtc: number, todayUtcDateStr: string): Promise<DailyReportSetting[]> {
        return this.repo
            .createQueryBuilder("setting")
            .where("setting.enabled = true")
            .andWhere("setting.hourUtc = :hourUtc", { hourUtc })
            .andWhere("setting.minuteUtc = :minuteUtc", { minuteUtc })
            .andWhere('(setting."lastSentDate" IS NULL OR setting."lastSentDate" != :today)', { today: todayUtcDateStr })
            .getMany();
    }

    async markSent(id: string, todayUtcDateStr: string): Promise<void> {
        await this.repo.update(id, { lastSentDate: todayUtcDateStr });
    }

    async disable(id: string): Promise<void> {
        await this.repo.update(id, { enabled: false });
    }

    async isChannelConnected(userId: string, channel: DailyReportChannel): Promise<boolean> {
        if (channel === DailyReportChannel.TELEGRAM) {
            const sub = await this.botService.getSubscription(userId);
            return !!sub?.isVerified;
        }
        const sub = await this.emailSubscriptionService.getSubscription(userId);
        return !!sub?.isVerified;
    }

    private async assertChannelsConnected(userId: string, channels: DailyReportChannel[]): Promise<void> {
        const messages: string[] = [];

        for (const channel of channels) {
            const connected = await this.isChannelConnected(userId, channel);
            if (connected) continue;

            messages.push(
                channel === DailyReportChannel.TELEGRAM
                    ? "Telegram is not connected yet. Generate a connection code via POST /telegram/subscription/token and send it to the SolSight Telegram bot first."
                    : "Email is not connected yet. Submit and verify your email via POST /email/subscription first."
            );
        }

        if (messages.length > 0) {
            throw new BadRequestException(messages.join(" "));
        }
    }
}

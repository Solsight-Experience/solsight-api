import { Injectable } from "@nestjs/common";
import { NotificationsService } from "../../notifications/services/notifications.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { BroadcastNotificationDto } from "../dtos/broadcast-notification.dto";
import { NotificationEventType } from "../../notifications/entities/notification.entity";

@Injectable()
export class AdminNotificationsService {
    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly analyticsService: AdminAnalyticsService
    ) {}

    async broadcast(dto: BroadcastNotificationDto): Promise<{ sent: number }> {
        const userIds = await this.analyticsService.getAllActiveUserIds();

        await Promise.all(
            userIds.map((userId) =>
                this.notificationsService.notifyUser(userId, {
                    type: NotificationEventType.SYSTEM_ANNOUNCEMENT,
                    title: dto.title,
                    message: dto.message,
                    metadata: dto.metadata
                })
            )
        );

        return { sent: userIds.length };
    }

    async notifyUser(userId: string, dto: BroadcastNotificationDto): Promise<{ sent: number }> {
        await this.notificationsService.notifyUser(userId, {
            type: NotificationEventType.SYSTEM_ANNOUNCEMENT,
            title: dto.title,
            message: dto.message,
            metadata: dto.metadata
        });
        return { sent: 1 };
    }
}

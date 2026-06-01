import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationsService } from "../../notifications/services/notifications.service";
import { AdminAnalyticsService } from "./admin-analytics.service";
import { BroadcastNotificationDto } from "../dtos/broadcast-notification.dto";
import { NotifyUserByEmailDto } from "../dtos/notify-user-by-email.dto";
import { NotificationEventType } from "../../notifications/entities/notification.entity";
import { User } from "../../users/entities/user.entity";

@Injectable()
export class AdminNotificationsService {
    constructor(
        private readonly notificationsService: NotificationsService,
        private readonly analyticsService: AdminAnalyticsService,
        @InjectRepository(User) private readonly userRepo: Repository<User>
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

    async notifyUserByEmail(dto: NotifyUserByEmailDto): Promise<{ sent: number }> {
        const user = await this.userRepo.findOne({ where: { email: dto.email } });
        if (!user) throw new NotFoundException(`User with email ${dto.email} not found`);
        await this.notificationsService.notifyUser(user.id, {
            type: NotificationEventType.SYSTEM_ANNOUNCEMENT,
            title: dto.title,
            message: dto.message,
            metadata: dto.metadata
        });
        return { sent: 1 };
    }
}

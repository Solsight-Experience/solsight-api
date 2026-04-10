import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, LessThan, FindOptionsWhere } from "typeorm";
import { Notification, NotificationChannel } from "../entities/notification.entity";
import { NotificationDeliveryService } from "./notification-delivery.service";
import { NotificationPayloadDto, NotificationOptionsDto } from "../dtos/notification-payload.dto";
import { QueryNotificationsDto } from "../dtos/query-notifications.dto";

const DEFAULT_CHANNELS = [NotificationChannel.WEBSOCKET];
const DEFAULT_PERSIST = true;
const DEFAULT_QUERY_LIMIT = 20;
const MAX_QUERY_LIMIT = 100;

@Injectable()
export class NotificationsService {
    private readonly logger = new Logger(NotificationsService.name);

    constructor(
        @InjectRepository(Notification)
        private readonly notificationRepository: Repository<Notification>,
        private readonly deliveryService: NotificationDeliveryService
    ) {}

    async notifyUser(userId: string, payload: NotificationPayloadDto, options?: NotificationOptionsDto): Promise<Notification | null> {
        const persist = options?.persist ?? DEFAULT_PERSIST;
        const channels = options?.channels ?? DEFAULT_CHANNELS;

        let notification: Notification | null = null;

        if (persist) {
            notification = this.notificationRepository.create({
                userId,
                type: payload.type,
                title: payload.title,
                message: payload.message,
                metadata: payload.metadata
            });
            notification = await this.notificationRepository.save(notification);
        }

        const deliverableNotification =
            notification ??
            ({
                id: crypto.randomUUID(),
                userId,
                type: payload.type,
                title: payload.title,
                message: payload.message,
                metadata: payload.metadata,
                isRead: false,
                createdAt: new Date()
            } as Notification);

        this.deliveryService.deliver({
            notification: deliverableNotification,
            channels
        });

        return notification;
    }

    broadcast(payload: NotificationPayloadDto, options?: NotificationOptionsDto): void {
        const channels = options?.channels ?? DEFAULT_CHANNELS;

        if (channels.includes(NotificationChannel.WEBSOCKET)) {
            this.deliveryService.broadcastToAll({
                id: crypto.randomUUID(),
                type: payload.type,
                title: payload.title,
                message: payload.message,
                metadata: payload.metadata,
                isRead: false,
                createdAt: new Date()
            });
        }
    }

    async getNotificationsForUser(userId: string, query?: QueryNotificationsDto): Promise<{ notifications: Notification[]; hasMore: boolean }> {
        const limit = Math.min(query?.limit ?? DEFAULT_QUERY_LIMIT, MAX_QUERY_LIMIT);

        const where: FindOptionsWhere<Notification> = { userId };

        if (query?.filter?.type) {
            where.type = query.filter.type;
        }

        if (query?.filter?.isRead !== undefined) {
            where.isRead = query.filter.isRead;
        }

        if (query?.cursor) {
            where.createdAt = LessThan(new Date(query.cursor));
        }

        const notifications = await this.notificationRepository.find({
            where,
            order: { createdAt: "DESC" },
            take: limit + 1
        });

        const hasMore = notifications.length > limit;
        if (hasMore) {
            notifications.pop();
        }

        return { notifications, hasMore };
    }

    async markAsRead(notificationId: string, userId: string): Promise<void> {
        await this.notificationRepository.update({ id: notificationId, userId }, { isRead: true });
    }

    async markAllAsRead(userId: string): Promise<void> {
        await this.notificationRepository.update({ userId, isRead: false }, { isRead: true });
    }

    async countUnread(userId: string): Promise<number> {
        return this.notificationRepository.count({
            where: { userId, isRead: false }
        });
    }

    async delete(notificationId: string, userId: string): Promise<void> {
        await this.notificationRepository.delete({ id: notificationId, userId });
    }

    async deleteAll(userId: string): Promise<void> {
        await this.notificationRepository.delete({ userId });
    }
}

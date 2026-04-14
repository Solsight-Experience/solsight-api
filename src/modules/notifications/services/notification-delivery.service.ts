import { Injectable, Logger } from "@nestjs/common";
import { WebsocketGateway } from "../../../websocket/websocket.gateway";
import { EmailSubscriptionService } from "../../email/services/email-subscription.service";
import { Notification, NotificationChannel } from "../entities/notification.entity";

export interface NotificationDeliveryPayload {
    notification: Notification;
    channels: NotificationChannel[];
}

@Injectable()
export class NotificationDeliveryService {
    private readonly logger = new Logger(NotificationDeliveryService.name);

    constructor(
        private readonly gateway: WebsocketGateway,
        private readonly emailSubscription: EmailSubscriptionService
    ) {}

    deliver(payload: NotificationDeliveryPayload): void {
        const { notification, channels } = payload;

        for (const channel of channels) {
            switch (channel) {
                case NotificationChannel.WEBSOCKET:
                    this.deliverViaWebSocket(notification);
                    break;
                case NotificationChannel.EMAIL:
                    this.deliverViaEmail(notification);
                    break;
                default:
                    this.logger.warn(`Unknown notification channel: ${channel as string}`);
            }
        }
    }

    broadcastToAll(notification: Omit<Notification, "userId" | "user">): void {
        try {
            this.gateway.server.emit("notification", {
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                metadata: notification.metadata,
                createdAt: notification.createdAt
            });
        } catch (error) {
            this.logger.error("Failed to broadcast notification via WebSocket", error);
        }
    }

    private deliverViaWebSocket(notification: Notification): void {
        try {
            const userRoom = `user:${notification.userId}`;
            this.gateway.emit(userRoom, "notification", {
                id: notification.id,
                type: notification.type,
                title: notification.title,
                message: notification.message,
                metadata: notification.metadata,
                isRead: notification.isRead,
                createdAt: notification.createdAt
            });
        } catch (error) {
            this.logger.error(`Failed to deliver notification ${notification.id} via WebSocket`, error);
        }
    }

    private async deliverViaEmail(notification: Notification): Promise<void> {
        try {
            await this.emailSubscription.sendAlertEmail(notification.userId, notification.title, notification.title, notification.message);
        } catch (error) {
            this.logger.error(`Failed to deliver notification ${notification.id} via email`, error);
        }
    }
}

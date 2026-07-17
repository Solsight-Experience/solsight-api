import { Injectable, Logger } from "@nestjs/common";
import { WebsocketGateway } from "../../../websocket/websocket.gateway";
import { EmailSubscriptionService } from "../../email/services/email-subscription.service";
import { Notification, NotificationChannel } from "../entities/notification.entity";
import { NotificationDeliveryPayload } from "../types/notification-delivery.types";
import { NotificationEmailDto } from "../dtos/notification-payload.dto";

@Injectable()
export class NotificationDeliveryService {
    private readonly logger = new Logger(NotificationDeliveryService.name);

    constructor(
        private readonly gateway: WebsocketGateway,
        private readonly emailSubscription: EmailSubscriptionService
    ) {}

    deliver(payload: NotificationDeliveryPayload): void {
        const { notification, channels, email } = payload;

        for (const channel of channels) {
            switch (channel) {
                case NotificationChannel.WEBSOCKET:
                    this.deliverViaWebSocket(notification);
                    break;
                case NotificationChannel.EMAIL:
                    void this.deliverViaEmail(notification, email);
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

    private async deliverViaEmail(notification: Notification, email?: NotificationEmailDto): Promise<void> {
        try {
            if (email?.template === "wallet_alert") {
                await this.emailSubscription.sendWalletAlertEmail(notification.userId, notification.title, notification.title, email.bodyHtml, email.bodyText);
                return;
            }
            await this.emailSubscription.sendAlertEmail(notification.userId, notification.title, notification.title, notification.message);
        } catch (error) {
            this.logger.error(`Failed to deliver notification ${notification.id} via email`, error);
        }
    }
}

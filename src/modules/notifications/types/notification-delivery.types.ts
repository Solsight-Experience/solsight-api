import { Notification, NotificationChannel } from "../entities/notification.entity";

export interface NotificationDeliveryPayload {
    notification: Notification;
    channels: NotificationChannel[];
}

import { Notification, NotificationChannel } from "../entities/notification.entity";
import { NotificationEmailDto } from "../dtos/notification-payload.dto";

export interface NotificationDeliveryPayload {
    notification: Notification;
    channels: NotificationChannel[];
    email?: NotificationEmailDto;
}

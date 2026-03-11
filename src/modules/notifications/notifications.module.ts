import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebsocketModule } from '../../websocket/websocket.module';
import { Notification } from './entities/notification.entity';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationsService } from './services/notifications.service';
import { NotificationDeliveryService } from './services/notification-delivery.service';
import { NotificationGateway } from './services/notification.gateway';

@Module({
  imports: [TypeOrmModule.forFeature([Notification]), WebsocketModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationDeliveryService,
    NotificationGateway,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}

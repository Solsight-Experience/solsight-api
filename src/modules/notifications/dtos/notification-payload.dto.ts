import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsObject,
  IsArray,
  IsBoolean,
} from 'class-validator';
import {
  NotificationEventType,
  NotificationChannel,
} from '../entities/notification.entity';

export class NotificationPayloadDto {
  @IsEnum(NotificationEventType)
  type: NotificationEventType;

  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  message: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class NotificationOptionsDto {
  @IsOptional()
  @IsBoolean()
  persist?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(NotificationChannel, { each: true })
  channels?: NotificationChannel[];
}

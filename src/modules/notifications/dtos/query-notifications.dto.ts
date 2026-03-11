import {
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsDateString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationEventType } from '../entities/notification.entity';

export class DateRangeDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class NotificationFilterDto {
  @IsOptional()
  @IsEnum(NotificationEventType)
  type?: NotificationEventType;

  @IsOptional()
  @IsBoolean()
  isRead?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => DateRangeDto)
  timeRange?: DateRangeDto;
}

export class QueryNotificationsDto {
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  limit?: number;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => NotificationFilterDto)
  filter?: NotificationFilterDto;
}

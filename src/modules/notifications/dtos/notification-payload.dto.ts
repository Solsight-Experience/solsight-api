import { IsEnum, IsNotEmpty, IsOptional, IsString, IsObject, IsArray, IsBoolean, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { NotificationEventType, NotificationChannel } from "../entities/notification.entity";

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

/**
 * Rich email payload for the EMAIL channel. When present, the delivery service
 * renders the chosen template instead of the plain notification message — lets a
 * caller (e.g. wallet alerts) opt into a formatted HTML email.
 */
export class NotificationEmailDto {
    @IsEnum(["wallet_alert"] as const)
    template: "wallet_alert";

    @IsString()
    bodyHtml: string;

    @IsString()
    bodyText: string;
}

export class NotificationOptionsDto {
    @IsOptional()
    @IsBoolean()
    persist?: boolean;

    @IsOptional()
    @IsArray()
    @IsEnum(NotificationChannel, { each: true })
    channels?: NotificationChannel[];

    @IsOptional()
    @ValidateNested()
    @Type(() => NotificationEmailDto)
    email?: NotificationEmailDto;
}

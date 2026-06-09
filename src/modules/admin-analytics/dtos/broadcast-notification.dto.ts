import { IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class BroadcastNotificationDto {
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

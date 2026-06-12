import { IsEmail, IsNotEmpty, IsObject, IsOptional, IsString } from "class-validator";

export class NotifyUserByEmailDto {
    @IsEmail()
    @IsNotEmpty()
    email: string;

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

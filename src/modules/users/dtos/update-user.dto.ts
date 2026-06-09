import { IsOptional, IsString, IsBoolean, IsEnum } from "class-validator";
import { UserRole } from "../entities/user.entity";

export class UpdateUserDto {
    @IsOptional()
    @IsString()
    firstName?: string;

    @IsOptional()
    @IsString()
    lastName?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @IsString()
    banReason?: string;

    @IsOptional()
    @IsString()
    adminNote?: string;
}

import { IsOptional, IsString, IsEnum, IsBoolean, IsInt, Min } from "class-validator";
import { Transform } from "class-transformer";
import { UserRole } from "../entities/user.entity";

export class UserFilterDto {
    @IsOptional()
    @IsString()
    search?: string;

    @IsOptional()
    @IsEnum(UserRole)
    role?: UserRole;

    @IsOptional()
    @Transform(({ value }) => (value === "true" ? true : value === "false" ? false : undefined))
    @IsBoolean()
    isActive?: boolean;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10) || 1)
    @IsInt()
    @Min(1)
    page: number = 1;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10) || 10)
    @IsInt()
    @Min(1)
    limit: number = 10;
}

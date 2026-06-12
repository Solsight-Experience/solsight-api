import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { UsersService } from "../services/users.service";
import { CreateUserDto } from "../dtos/create-user.dto";
import { UpdateUserDto } from "../dtos/update-user.dto";
import { UserFilterDto } from "../dtos/user-filter.dto";
import { BanUserDto } from "../dtos/ban-user.dto";
import { ChangeRoleDto } from "../dtos/change-role.dto";
import { User, UserRole } from "../entities/user.entity";

@Controller("users")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class UsersController {
    constructor(private readonly usersService: UsersService) {}

    @Get()
    async findAll(@Query() filters: UserFilterDto) {
        return this.usersService.findAll(filters);
    }

    @Get(":id")
    async findById(@Param("id") id: string): Promise<User> {
        return this.usersService.findById(id);
    }

    @Post()
    async create(@Body() dto: CreateUserDto): Promise<User> {
        return this.usersService.create(dto);
    }

    @Put(":id")
    async update(@Param("id") id: string, @Body() dto: UpdateUserDto): Promise<User> {
        return this.usersService.update(id, dto);
    }

    @Delete(":id")
    async delete(@Param("id") id: string): Promise<{ message: string }> {
        return this.usersService.delete(id);
    }

    @Put(":id/ban")
    async ban(@Param("id") id: string, @Body() dto: BanUserDto): Promise<User> {
        return this.usersService.ban(id, dto.reason);
    }

    @Put(":id/unban")
    async unban(@Param("id") id: string): Promise<User> {
        return this.usersService.unban(id);
    }

    @Put(":id/role")
    async changeRole(@Param("id") id: string, @Body() dto: ChangeRoleDto): Promise<User> {
        return this.usersService.changeRole(id, dto.role);
    }

    @Get(":id/wallets")
    async getUserWallets(@Param("id") id: string) {
        return this.usersService.getUserWallets(id);
    }

    @Get(":id/swap-stats")
    async getUserSwapStats(@Param("id") id: string) {
        return this.usersService.getUserSwapStats(id);
    }
}

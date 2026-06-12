import { Body, Controller, Param, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { UserRole } from "../../users/entities/user.entity";
import { AdminNotificationsService } from "../services/admin-notifications.service";
import { BroadcastNotificationDto } from "../dtos/broadcast-notification.dto";
import { NotifyUserByEmailDto } from "../dtos/notify-user-by-email.dto";

@Controller("admin/notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminNotificationsController {
    constructor(private readonly adminNotificationsService: AdminNotificationsService) {}

    @Post("broadcast")
    async broadcast(@Body() dto: BroadcastNotificationDto): Promise<{ sent: number }> {
        return this.adminNotificationsService.broadcast(dto);
    }

    @Post("user/:userId")
    async notifyUser(@Param("userId") userId: string, @Body() dto: BroadcastNotificationDto): Promise<{ sent: number }> {
        return this.adminNotificationsService.notifyUser(userId, dto);
    }

    @Post("user-by-email")
    async notifyUserByEmail(@Body() dto: NotifyUserByEmailDto): Promise<{ sent: number }> {
        return this.adminNotificationsService.notifyUserByEmail(dto);
    }
}

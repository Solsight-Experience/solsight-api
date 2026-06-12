import { Controller, Get, Patch, Delete, Param, Query, UseGuards, Request } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { NotificationsService } from "../services/notifications.service";
import { QueryNotificationsDto } from "../dtos/query-notifications.dto";
import { AuthenticatedRequest } from "../../../common/guards/guard.type";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get()
    async getNotifications(@Request() req: AuthenticatedRequest, @Query() query: QueryNotificationsDto) {
        return this.notificationsService.getNotificationsForUser(req.user.id, query);
    }

    @Get("unread-count")
    async getUnreadCount(@Request() req: AuthenticatedRequest) {
        const count = await this.notificationsService.countUnread(req.user.id);
        return { count };
    }

    @Patch(":id/read")
    async markAsRead(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
        await this.notificationsService.markAsRead(id, req.user.id);
        return { success: true };
    }

    @Patch("read-all")
    async markAllAsRead(@Request() req: AuthenticatedRequest) {
        await this.notificationsService.markAllAsRead(req.user.id);
        return { success: true };
    }

    @Delete()
    async deleteAllNotifications(@Request() req: AuthenticatedRequest) {
        await this.notificationsService.deleteAll(req.user.id);
        return { success: true };
    }

    @Delete(":id")
    async deleteNotification(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
        await this.notificationsService.delete(id, req.user.id);
        return { success: true };
    }
}

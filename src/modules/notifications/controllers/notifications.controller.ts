import { Controller, Get, Patch, Delete, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { NotificationsService } from "../services/notifications.service";
import { QueryNotificationsDto } from "../dtos/query-notifications.dto";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller("notifications")
@UseGuards(JwtAuthGuard)
export class NotificationsController {
    constructor(private readonly notificationsService: NotificationsService) {}

    @Get()
    async getNotifications(@CurrentUser() user: CurrentUserPayload, @Query() query: QueryNotificationsDto) {
        return this.notificationsService.getNotificationsForUser(user.id, query);
    }

    @Get("unread-count")
    async getUnreadCount(@CurrentUser() user: CurrentUserPayload) {
        const count = await this.notificationsService.countUnread(user.id);
        return { count };
    }

    @Patch(":id/read")
    async markAsRead(@CurrentUser() user: CurrentUserPayload, @Param("id") id: string) {
        await this.notificationsService.markAsRead(id, user.id);
        return { success: true };
    }

    @Patch("read-all")
    async markAllAsRead(@CurrentUser() user: CurrentUserPayload) {
        await this.notificationsService.markAllAsRead(user.id);
        return { success: true };
    }

    @Delete()
    async deleteAllNotifications(@CurrentUser() user: CurrentUserPayload) {
        await this.notificationsService.deleteAll(user.id);
        return { success: true };
    }

    @Delete(":id")
    async deleteNotification(@CurrentUser() user: CurrentUserPayload, @Param("id") id: string) {
        await this.notificationsService.delete(id, user.id);
        return { success: true };
    }
}

import { CanActivate, ExecutionContext, INestApplication, InternalServerErrorException, NotFoundException, ValidationPipe } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import { App } from "supertest/types";
import * as request from "supertest";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { NotificationEventType } from "../entities/notification.entity";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "../services/notifications.service";

const USER_ID = "test-user-id";

class AllowAuthGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const req = context.switchToHttp().getRequest();
        req.user = { id: USER_ID };
        return true;
    }
}

class DenyAuthGuard implements CanActivate {
    canActivate(): boolean {
        return false;
    }
}

describe("NotificationsController API", () => {
    let app: INestApplication<App>;

    const notificationsServiceMock = {
        getNotificationsForUser: jest.fn(),
        countUnread: jest.fn(),
        markAsRead: jest.fn(),
        markAllAsRead: jest.fn()
    };

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [NotificationsController],
            providers: [
                {
                    provide: NotificationsService,
                    useValue: notificationsServiceMock
                }
            ]
        })
            .overrideGuard(JwtAuthGuard)
            .useClass(AllowAuthGuard)
            .compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(
            new ValidationPipe({
                whitelist: true,
                forbidNonWhitelisted: true,
                transform: true
            })
        );
        await app.init();
    });

    beforeEach(() => {
        jest.clearAllMocks();
    });

    afterAll(async () => {
        await app.close();
    });

    it("GET /notifications returns user notifications with pagination metadata", async () => {
        notificationsServiceMock.getNotificationsForUser.mockResolvedValue({
            notifications: [
                {
                    id: "notif-1",
                    userId: USER_ID,
                    type: NotificationEventType.SYSTEM_ANNOUNCEMENT,
                    title: "System update",
                    message: "Scheduled maintenance",
                    metadata: null,
                    isRead: false,
                    createdAt: "2026-03-10T10:00:00.000Z"
                }
            ],
            hasMore: false
        });

        const response = await request(app.getHttpServer())
            .get("/notifications")
            .query({
                limit: "25",
                cursor: "2026-03-11T00:00:00.000Z"
            })
            .expect(200);

        expect(response.body).toEqual({
            notifications: [
                expect.objectContaining({
                    id: "notif-1",
                    type: NotificationEventType.SYSTEM_ANNOUNCEMENT
                })
            ],
            hasMore: false
        });
        expect(notificationsServiceMock.getNotificationsForUser).toHaveBeenCalledWith(USER_ID, {
            limit: 25,
            cursor: "2026-03-11T00:00:00.000Z"
        });
    });

    it("GET /notifications rejects invalid query params", async () => {
        await request(app.getHttpServer()).get("/notifications").query({ limit: "invalid" }).expect(400);

        expect(notificationsServiceMock.getNotificationsForUser).not.toHaveBeenCalled();
    });

    it("GET /notifications rejects invalid notification type in filter", async () => {
        await request(app.getHttpServer()).get("/notifications").query({ "filter[type]": "invalid_type" }).expect(400);

        expect(notificationsServiceMock.getNotificationsForUser).not.toHaveBeenCalled();
    });

    it("GET /notifications/unread-count returns unread count", async () => {
        notificationsServiceMock.countUnread.mockResolvedValue(7);

        const response = await request(app.getHttpServer()).get("/notifications/unread-count").expect(200);

        expect(response.body).toEqual({ count: 7 });
        expect(notificationsServiceMock.countUnread).toHaveBeenCalledWith(USER_ID);
    });

    it("PATCH /notifications/:id/read marks one notification as read", async () => {
        notificationsServiceMock.markAsRead.mockResolvedValue(undefined);

        const response = await request(app.getHttpServer()).patch("/notifications/notif-1/read").expect(200);

        expect(response.body).toEqual({ success: true });
        expect(notificationsServiceMock.markAsRead).toHaveBeenCalledWith("notif-1", USER_ID);
    });

    it("PATCH /notifications/:id/read propagates not found errors", async () => {
        notificationsServiceMock.markAsRead.mockRejectedValue(new NotFoundException("Notification not found"));

        const response = await request(app.getHttpServer()).patch("/notifications/not-found/read").expect(404);

        expect(response.body.message).toBe("Notification not found");
    });

    it("PATCH /notifications/read-all marks all unread notifications as read", async () => {
        notificationsServiceMock.markAllAsRead.mockResolvedValue(undefined);

        const response = await request(app.getHttpServer()).patch("/notifications/read-all").expect(200);

        expect(response.body).toEqual({ success: true });
        expect(notificationsServiceMock.markAllAsRead).toHaveBeenCalledWith(USER_ID);
    });

    it("PATCH /notifications/read-all propagates service errors", async () => {
        notificationsServiceMock.markAllAsRead.mockRejectedValue(new InternalServerErrorException("Failed to mark notifications as read"));

        const response = await request(app.getHttpServer()).patch("/notifications/read-all").expect(500);

        expect(response.body.message).toBe("Failed to mark notifications as read");
    });
});

describe("NotificationsController API auth guard", () => {
    let app: INestApplication<App>;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            controllers: [NotificationsController],
            providers: [
                {
                    provide: NotificationsService,
                    useValue: {
                        getNotificationsForUser: jest.fn(),
                        countUnread: jest.fn(),
                        markAsRead: jest.fn(),
                        markAllAsRead: jest.fn()
                    }
                }
            ]
        })
            .overrideGuard(JwtAuthGuard)
            .useClass(DenyAuthGuard)
            .compile();

        app = moduleFixture.createNestApplication();
        await app.init();
    });

    afterAll(async () => {
        await app.close();
    });

    it("blocks unauthenticated requests", async () => {
        await request(app.getHttpServer()).get("/notifications").expect(403);
    });
});

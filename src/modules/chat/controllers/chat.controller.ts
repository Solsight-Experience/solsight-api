import { Controller, Post, Body, UseGuards, HttpException, Logger, Get, Param, Query } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ChatService } from "../services/chat.service";
import { SendMessageDto } from "../dtos/send-message.dto";
import { ChatResponsePayload } from "../types/chat.types";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller("chat")
@UseGuards(JwtAuthGuard)
export class ChatController {
    private rateLimitMap = new Map<string, { count: number; windowStart: number }>();
    private readonly RATE_LIMIT = 20;
    private readonly WINDOW_MS = 60_000;
    private readonly logger = new Logger(ChatController.name);

    constructor(private readonly chatService: ChatService) {}

    @Post("message")
    async sendMessage(@Body() dto: SendMessageDto, @CurrentUser() user: CurrentUserPayload): Promise<ChatResponsePayload> {
        const userId = user.id;

        const now = Date.now();
        const entry = this.rateLimitMap.get(userId);
        if (!entry) {
            this.rateLimitMap.set(userId, { count: 1, windowStart: now });
        } else {
            if (now > entry.windowStart + this.WINDOW_MS) {
                // window expired
                this.rateLimitMap.set(userId, { count: 1, windowStart: now });
            } else {
                if (entry.count >= this.RATE_LIMIT) {
                    throw new HttpException("Rate limit exceeded", 429);
                }
                entry.count += 1;
                this.rateLimitMap.set(userId, entry);
            }
        }

        this.logger.log(`Received chat message from userId=${userId} session=${dto.sessionId}`, ChatController.name);

        return this.chatService.sendMessage({
            message: dto.message,
            sessionId: dto.sessionId,
            userId: userId,
            walletAddress: dto.walletAddress ?? user.walletAddress
        });
    }

    @Get("sessions/:sessionId/messages")
    async getSessionMessages(@Param("sessionId") sessionId: string, @Query("cursor") cursor?: string, @Query("limit") limit?: string) {
        const limitNum = limit ? parseInt(limit, 10) : 20;
        const messages = await this.chatService.getSessionMessages(sessionId, cursor, limitNum);

        let nextCursor: string | null = null;
        if (messages.length > 0) {
            nextCursor = messages[0].createdAt.toISOString();
        }

        return {
            messages,
            nextCursor
        };
    }
}

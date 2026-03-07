import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ChatService } from '../services/chat.service';
import { SendMessageDto } from '../dtos/send-message.dto';
import { ChatResponsePayload } from '../types/chat.types';
import { AppLoggerService } from 'src/common/logger/logger.service';

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private rateLimitMap = new Map<
    string,
    { count: number; windowStart: number }
  >();
  private readonly RATE_LIMIT = 20;
  private readonly WINDOW_MS = 60_000;

  constructor(
    private readonly chatService: ChatService,
    private readonly logger: AppLoggerService,
  ) {}

  @Post('message')
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Request() req: any,
  ): Promise<ChatResponsePayload> {
    const userId = req.user?.id;
    if (!userId) {
      this.logger.warn(
        `Unauthorized chat message attempt: no userId in request`,
        ChatController.name,
      );
      // Should be guarded by JwtAuthGuard, but be defensive
      throw new HttpException('Unauthorized', 401);
    }

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
          throw new HttpException('Rate limit exceeded', 429);
        }
        entry.count += 1;
        this.rateLimitMap.set(userId, entry);
      }
    }

    this.logger.log(
      `Received chat message from userId=${userId} session=${dto.sessionId}`,
      ChatController.name,
    );

    return this.chatService.sendMessage({
      message: dto.message,
      sessionId: dto.sessionId,
      userId: userId,
      walletAddress: dto.walletAddress ?? req.user?.walletAddress,
    });
  }
}

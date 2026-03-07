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

@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  private rateLimitMap = new Map<string, { count: number; windowStart: number }>();
  private readonly RATE_LIMIT = 20;
  private readonly WINDOW_MS = 60_000;

  constructor(private readonly chatService: ChatService) {}

  @Post('message')
  async sendMessage(
    @Body() dto: SendMessageDto,
    @Request() req: any,
  ): Promise<ChatResponsePayload> {
    const userId = req.user?.id;
    if (!userId) {
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

    return this.chatService.sendMessage({
      message: dto.message,
      sessionId: dto.sessionId,
      walletAddress: dto.walletAddress ?? req.user?.walletAddress,
    });
  }
}

import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";
import { TelegramUpdate, TelegramGetUpdatesResponse } from "../types/telegram-api.types";

@Injectable()
export class TelegramApiService {
    private readonly logger = new Logger(TelegramApiService.name);
    private readonly baseUrl: string;
    private readonly token: string;
    private offset = 0;

    constructor(config: ConfigService) {
        this.token = config.get<string>("telegram.botToken") ?? "";
        this.baseUrl = `https://api.telegram.org/bot${this.token}`;
    }

    get hasToken(): boolean {
        return !!this.token;
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        try {
            await axios.post(`${this.baseUrl}/sendMessage`, { chat_id: chatId, text }, { timeout: 5000 });
        } catch (err) {
            this.logger.error(`Failed to send Telegram message to chat ${chatId}`, err);
        }
    }

    async getUpdate(timeoutSec = 25): Promise<TelegramUpdate | null> {
        try {
            const { data } = await axios.get<TelegramGetUpdatesResponse>(`${this.baseUrl}/getUpdates`, {
                params: { timeout: timeoutSec, offset: this.offset },
                timeout: (timeoutSec + 5) * 1000
            });

            if (!data?.ok || !data.result?.length) return null;

            const raw = data.result[0];
            this.offset = raw.update_id + 1;

            const msg = raw.message;
            if (!msg?.from?.id) return null;

            return {
                fromId: String(msg.from.id),
                chatId: String(msg.chat?.id ?? msg.from.id),
                text: msg.text ?? "",
                date: msg.date ?? Date.now()
            };
        } catch {
            return null;
        }
    }
}

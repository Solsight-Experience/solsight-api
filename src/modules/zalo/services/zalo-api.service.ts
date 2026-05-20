import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios from "axios";

export interface ZaloUpdate {
    fromId: string;
    chatId: string;
    text: string;
    date: number;
}

@Injectable()
export class ZaloApiService {
    private readonly logger = new Logger(ZaloApiService.name);
    private readonly baseUrl: string;
    private readonly token: string;

    constructor(config: ConfigService) {
        this.token = config.get<string>("zalo.botToken") ?? "";
        this.baseUrl = `https://bot-api.zaloplatforms.com/bot${this.token}`;
    }

    get hasToken(): boolean {
        return !!this.token;
    }

    async sendMessage(chatId: string, text: string): Promise<void> {
        try {
            await axios.post(`${this.baseUrl}/sendMessage`, { chat_id: chatId, text }, { timeout: 5000 });
        } catch (err) {
            this.logger.error(`Failed to send Zalo message to chat ${chatId}`, err);
        }
    }

    /**
     * Long-polls for the next incoming message.
     * Blocks for up to `timeoutSec` seconds. Returns null on timeout or error.
     */
    async getUpdate(timeoutSec = 25): Promise<ZaloUpdate | null> {
        try {
            const { data } = await axios.post(`${this.baseUrl}/getUpdates`, { timeout: String(timeoutSec) }, { timeout: (timeoutSec + 5) * 1000 });
            if (!data?.ok || !data?.result?.message) return null;
            const msg = data.result.message;
            return {
                fromId: msg.from?.id,
                chatId: msg.chat?.id ?? msg.from?.id,
                text: msg.text ?? "",
                date: msg.date ?? Date.now()
            };
        } catch {
            return null;
        }
    }
}

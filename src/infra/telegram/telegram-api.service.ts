import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { TelegramUpdate, TelegramGetUpdatesResponse, TelegramParseMode } from "./telegram-api.types";

@Injectable()
export class TelegramApiService {
    private readonly logger = new Logger(TelegramApiService.name);
    private readonly apiClient: AxiosInstance;
    private offset = 0;

    constructor(config: ConfigService) {
        const token = config.get<string>("telegram.botToken") ?? "";
        this.apiClient = axios.create({
            baseURL: `https://api.telegram.org/bot${token}`,
            timeout: 10000,
            headers: { "Content-Type": "application/json" }
        });
    }

    get hasToken(): boolean {
        const baseURL = this.apiClient.defaults.baseURL ?? "";
        return baseURL !== "https://api.telegram.org/bot";
    }

    async sendMessage(chatId: string, text: string, parseMode?: TelegramParseMode): Promise<void> {
        try {
            await this.apiClient.post("/sendMessage", { chat_id: chatId, text, parse_mode: parseMode });
        } catch (err) {
            this.logger.error(`Failed to send Telegram message to chat ${chatId}`, err);
        }
    }

    async getUpdate(timeoutSec = 25): Promise<TelegramUpdate | null> {
        try {
            const { data } = await this.apiClient.get<TelegramGetUpdatesResponse>("/getUpdates", {
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

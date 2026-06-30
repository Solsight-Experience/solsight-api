export interface TelegramUpdate {
    fromId: string;
    chatId: string;
    text: string;
    date: number;
}

export interface TelegramMessage {
    from?: { id?: number };
    chat?: { id?: number };
    text?: string;
    date?: number;
}

export interface TelegramRawUpdate {
    update_id: number;
    message?: TelegramMessage;
}

export interface TelegramGetUpdatesResponse {
    ok?: boolean;
    result?: TelegramRawUpdate[];
}

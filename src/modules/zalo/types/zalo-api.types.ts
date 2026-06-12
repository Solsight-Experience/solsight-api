export interface ZaloUpdate {
    fromId: string;
    chatId: string;
    text: string;
    date: number;
}

export interface ZaloApiMessage {
    from?: {
        id?: string;
    };
    chat?: {
        id?: string;
    };
    text?: string;
    date?: number;
}

export interface ZaloUpdatesResponse {
    ok?: boolean;
    result?: {
        message?: ZaloApiMessage;
    };
}

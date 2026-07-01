import { Logger } from "@nestjs/common";
import axios from "axios";

export function getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
        return getAxiosResponseMessage(error.response?.data) ?? error.message;
    }
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export function getErrorStack(error: unknown): string | undefined {
    if (error instanceof Error) {
        return error.stack;
    }
    return undefined;
}

// Upstream APIs commonly shape error bodies as { message | error | detail } or a plain string.
function getAxiosResponseMessage(data: unknown): string | undefined {
    if (typeof data === "string") {
        return data.length > 0 ? data : undefined;
    }
    if (typeof data !== "object" || data === null) {
        return undefined;
    }
    const record = data as Record<string, unknown>;
    for (const key of ["message", "error", "detail"]) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0) return value;
        if (value !== undefined && value !== null) return JSON.stringify(value);
    }
    return undefined;
}

export function logError(logger: Logger, message: string, error: unknown): void {
    if (axios.isAxiosError(error)) {
        const status = error.response?.status ?? "unknown";
        const detail = getAxiosResponseMessage(error.response?.data) ?? error.message;
        logger.error(`${message} [${status}]: ${detail}`, error.stack);
        return;
    }
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`${message}: ${err.message}`, err.stack);
}

import { Logger } from "@nestjs/common";

export function getErrorMessage(error: unknown): string {
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

export function logError(logger: Logger, message: string, error: unknown): void {
    const err = error instanceof Error ? error : new Error(String(error));
    logger.error(`${message}: ${err.message}`, err.stack);
}

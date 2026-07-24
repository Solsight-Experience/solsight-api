const DEFAULT_REDIRECT_PATH = "/";

/** Relative paths only — rejects protocol-relative ("//host") and absolute URLs to prevent open redirects. */
export function isSafeRelativePath(path: unknown): path is string {
    return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("://");
}

export function toSafeRedirectPath(path: unknown, fallback: string = DEFAULT_REDIRECT_PATH): string {
    return isSafeRelativePath(path) ? path : fallback;
}

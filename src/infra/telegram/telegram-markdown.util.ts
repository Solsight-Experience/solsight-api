// https://core.telegram.org/bots/api#markdownv2-style
const SPECIAL_CHARS = /[_*[\]()~`>#+\-=|{}.!\\]/g;

export function escapeMarkdownV2(text: string): string {
    return text.replace(SPECIAL_CHARS, "\\$&");
}

// Inside a link's (URL) part only ")" and "\" need escaping.
export function escapeMarkdownV2LinkUrl(url: string): string {
    return url.replace(/[)\\]/g, "\\$&");
}

export function markdownV2Link(label: string, url: string): string {
    return `[${escapeMarkdownV2(label)}](${escapeMarkdownV2LinkUrl(url)})`;
}

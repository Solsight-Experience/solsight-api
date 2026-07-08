import type { HolderAccountType } from "../types/holder-aggregation.types";

export const WALLET_LABELS: Record<string, { name: string; type: HolderAccountType }> = {
    // Coinbase
    H8sMJSCQxfKiFTCfDR3DUMLPwcRbM61LGFJ8N4dK3WjS: { name: "Coinbase", type: "CEX" },
    "2AQdpHJ2JpcEgPiATUXjQxA8QmafFegfQwSLWSprPicm": { name: "Coinbase 2", type: "CEX" },
    // Binance
    "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9": { name: "Binance", type: "CEX" },
    // OKX
    "5VCwKtCXgCJ6kit5FybXjvriW3xELsFDhYrPSqtJNmcD": { name: "OKX", type: "CEX" },
    // Changelly
    "3yFwqXBfZY4jBVUafQ1YEXw189y2dN3V5KQq9uzBDy1E": { name: "Changelly", type: "CEX" },
    // Kraken
    "2ojv9BAiHUrvsm9gxDe7fJSzbNZSJcxZvf8dqmWGHG8S": { name: "Kraken", type: "CEX" },
    // Bybit
    A7eHSuGAUCzDHMnJVVSBjgSWVFnqFHBVv7MBqFSmMNT4: { name: "Bybit", type: "CEX" },
    // Bitget
    C6tz7SZfaWxrnBNUrNkQ8NKJGRz5Q4pzFJAiEEQpjFja: { name: "Bitget", type: "CEX" },
    // KuCoin
    BmFdpraQhkiDQE6SnfG5omcA1VwzqfXrwtNYBwWTymy6: { name: "KuCoin", type: "CEX" },
    // MEXC
    BVxyYhm498L79r4HMQ9sxZ5bi41DmJmeWZ7SCS7Cyvna: { name: "MEXC", type: "CEX" },
    // Burn addresses
    "1nc1nerator11111111111111111111111111111111": { name: "Burn", type: "BURN" }
};

export function getWalletLabel(address: string): { name: string; type: HolderAccountType } | null {
    return WALLET_LABELS[address] || null;
}

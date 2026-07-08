import { PublicKey, TransactionInstruction } from "@solana/web3.js";

export const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export function memoInstruction(text: string): TransactionInstruction {
    return new TransactionInstruction({
        keys: [],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(text, "utf8")
    });
}

export function buildOrderMemo(orderId: string): string {
    return `PAY:${orderId}`;
}

export function parseOrderIdFromMemo(memo: string): string | null {
    return memo.startsWith("PAY:") ? memo.slice(4) : null;
}

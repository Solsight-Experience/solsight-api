import { PublicKey } from "@solana/web3.js";
import type { ParsedInstruction, ParsedTransactionWithMeta, PartiallyDecodedInstruction } from "@solana/web3.js";
import bs58 from "bs58";
import { MEMO_PROGRAM_ID, parseOrderIdFromMemo } from "../constants/memo.constant";

export interface ParsedIncomingTransfer {
    orderId: string | null;
    rawMemo: string | null;
    source: string | null;
    lamports: bigint | null;
}

interface ParsedSystemTransferInfo {
    type: string;
    info: { destination: string; lamports: number; source: string };
}

function isParsedInstruction(ix: ParsedInstruction | PartiallyDecodedInstruction): ix is ParsedInstruction {
    return "parsed" in ix;
}

// Đọc transaction đã confirm trên chain, tìm system-transfer TỚI merchantWallet
// và memo "PAY:{orderId}" đi kèm — dùng bởi cron đối soát để verify độc lập các
// giao dịch mà app không tự submit (không được bảo đảm cấu trúc như flow submit chính).
export function extractIncomingTransfer(tx: ParsedTransactionWithMeta, merchantWallet: PublicKey): ParsedIncomingTransfer {
    const instructions = tx.transaction.message.instructions;
    const merchantAddress = merchantWallet.toBase58();

    let source: string | null = null;
    let lamports: bigint | null = null;
    for (const ix of instructions) {
        if (isParsedInstruction(ix) && ix.program === "system") {
            const parsed = ix.parsed as ParsedSystemTransferInfo;
            if (parsed.type === "transfer" && parsed.info.destination === merchantAddress) {
                source = parsed.info.source;
                lamports = BigInt(parsed.info.lamports);
                break;
            }
        }
    }

    let rawMemo: string | null = null;
    for (const ix of instructions) {
        if (!isParsedInstruction(ix) && ix.programId.equals(MEMO_PROGRAM_ID)) {
            try {
                rawMemo = Buffer.from(bs58.decode(ix.data)).toString("utf8");
            } catch {
                rawMemo = null;
            }
            if (rawMemo) break;
        }
    }

    const orderId = rawMemo ? parseOrderIdFromMemo(rawMemo) : null;

    return { orderId, rawMemo, source, lamports };
}

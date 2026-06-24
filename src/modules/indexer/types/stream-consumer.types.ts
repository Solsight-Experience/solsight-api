import { Transaction, TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";

export interface TransactionInsertRow {
    signature: string;
    network: string;
    type: TransactionType;
    status: TransactionStatus;
    amount: number;
    amountOut: number;
    tokenMint: string;
    tokenMintOut: string;
    signerAddress: string;
    blockNumber: string;
    blockTime: Date;
    metadata: Transaction["metadata"];
}

export type TransactionInsertParam = string | number | Date | null;

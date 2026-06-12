import { AccountInfo, ParsedAccountData, PublicKey } from "@solana/web3.js";

export interface ParsedTokenAmountInfo {
    amount: string;
    decimals: number;
    uiAmount: number | null;
    uiAmountString: string;
}

export interface ParsedTokenAccountInfo {
    mint: string;
    owner: string;
    state: string;
    tokenAmount: ParsedTokenAmountInfo;
}

export interface ParsedTokenAccountData extends ParsedAccountData {
    parsed: {
        info: ParsedTokenAccountInfo;
        type: string;
    };
}

export interface ParsedTokenAccount {
    pubkey: PublicKey;
    account: AccountInfo<ParsedTokenAccountData>;
}

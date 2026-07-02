export enum ExecutorCapability {
    Gasless = "gasless",
    MevProtection = "mevProtection"
}

export type ExecutorKey = "jupiter" | "solsight";

export interface ExecutorCapabilities {
    executorKey: ExecutorKey;
    capabilities: ReadonlyArray<ExecutorCapability>;
    gaslessSupportedTokens: ReadonlyArray<string>;
    payerPubkey: string | null;
}

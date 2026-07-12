export interface PaymentTransferEvent {
    event_id: string;
    from_wallet: string;
    to_wallet: string;
    lamports: number;
    memo: string | null;
    slot: number;
    signature: string;
    timestamp: number;
    network?: string;
}

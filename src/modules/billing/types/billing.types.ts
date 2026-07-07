export interface QuotaConsumptionResult {
    allowed: boolean;
    source?: "free" | "paid";
}

export interface QuotaStatus {
    freeUsed: number;
    freeLimit: number;
    paidCredits: number;
    resetsAt: string;
}

export interface BuiltPaymentTransaction {
    transaction: string;
    blockhash: string;
    lastValidBlockHeight: number;
}

export interface CreatedPaymentOrder extends BuiltPaymentTransaction {
    orderId: string;
    packageCode: string;
    credits: number;
    amountLamports: string;
    expiresAt: string;
}

export interface SubmitPaymentResult {
    success: boolean;
    creditsAdded: number;
    alreadyProcessed: boolean;
}

export interface CompleteOrderResult {
    alreadyProcessed: boolean;
    credits?: number;
}

export interface PaymentOrderSummary {
    id: string;
    packageCode: string;
    credits: number;
    amountLamports: string;
    network: string;
    status: string;
    txSignature: string | null;
    createdAt: string;
    expiresAt: string;
    completedAt: string | null;
}

export interface PaymentOrderPage {
    orders: PaymentOrderSummary[];
    total: number;
    page: number;
    limit: number;
}

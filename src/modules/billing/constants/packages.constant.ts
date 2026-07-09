export interface PaymentPackage {
    code: string;
    credits: number;
    lamports: bigint;
}

// Giá cố định theo SOL (chưa neo USD) — xem "còn mở" trong plan gốc.
export const PACKAGES: Record<string, PaymentPackage> = {
    credits_50: { code: "credits_50", credits: 50, lamports: 50_000_000n },
    credits_120: { code: "credits_120", credits: 120, lamports: 100_000_000n }
};

export const PACKAGE_CODES = Object.keys(PACKAGES);

export const ORDER_EXPIRY_MINUTES = 30;
export const ORDER_RATE_LIMIT_PER_HOUR = 10;

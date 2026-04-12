export class ZaloSubscriptionStatusDto {
    isVerified: boolean;
    verificationToken?: string;
    tokenExpiresAt?: string;
    verifiedAt?: string;
}

export class GenerateTokenResponseDto {
    verificationToken: string;
    tokenExpiresAt: string;
    instructions: string;
}

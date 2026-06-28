export class TelegramSubscriptionStatusDto {
    isVerified: boolean;
    verificationToken?: string;
    tokenExpiresAt?: string;
    verifiedAt?: string;
}

export class GenerateTelegramTokenResponseDto {
    verificationToken: string;
    tokenExpiresAt: string;
    instructions: string;
}

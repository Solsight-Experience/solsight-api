export class BotSubscriptionStatusDto {
    isVerified: boolean;
    verificationToken?: string;
    tokenExpiresAt?: string;
    verifiedAt?: string;
}

export class GenerateBotTokenResponseDto {
    verificationToken: string;
    tokenExpiresAt: string;
    instructions: string;
}

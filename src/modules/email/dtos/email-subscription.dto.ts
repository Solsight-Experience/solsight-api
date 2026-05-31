import { IsEmail } from "class-validator";

export class EmailSubscriptionStatusDto {
    isVerified: boolean;
    email?: string;
    verifiedAt?: string;
}

export class SubmitEmailDto {
    @IsEmail()
    email: string;
}

import { IsEmail, IsOptional, IsString } from "class-validator";

export class EmailSubscriptionStatusDto {
    isVerified: boolean;
    email?: string;
    verifiedAt?: string;
}

export class SubmitEmailDto {
    @IsEmail()
    email: string;

    /** Relative path (e.g. "/settings/alerts") to redirect to after the user clicks the verification link. */
    @IsOptional()
    @IsString()
    redirectPath?: string;
}

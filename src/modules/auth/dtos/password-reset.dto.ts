import { IsEmail, IsString, Length, MinLength } from "class-validator";

export class ForgotPasswordDto {
    @IsEmail()
    email: string;
}

export class VerifyResetOtpDto {
    @IsEmail()
    email: string;

    @IsString()
    @Length(6, 6)
    otp: string;
}

export class ResetPasswordDto {
    @IsEmail()
    email: string;

    @IsString()
    @Length(6, 6)
    otp: string;

    @IsString()
    @MinLength(6)
    password: string;
}

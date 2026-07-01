import { IsString, IsNotEmpty, IsOptional, Length, IsObject } from "class-validator";

export class SendMessageDto {
    @IsString()
    @IsNotEmpty()
    @Length(1, 2000)
    message: string;

    @IsString()
    @IsNotEmpty()
    sessionId: string;

    @IsOptional()
    @IsString()
    userId?: string;

    @IsOptional()
    @IsString()
    walletAddress?: string;

    @IsOptional()
    @IsObject()
    pageContext?: {
        pathname: string;
        tokenAddress?: string;
    };
}

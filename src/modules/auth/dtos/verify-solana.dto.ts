import { IsString, IsOptional } from 'class-validator';

export class VerifySolanaDto {
  @IsString()
  walletAddress: string;

  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  userId?: string;

  @IsOptional()
  @IsString()
  walletIcon?: string;
}

import { IsString } from 'class-validator';

/**
 * DTO for executing a Jupiter limit order
 */
export class ExecuteOrderDto {
  @IsString()
  requestId: string;

  @IsString()
  signedTransaction: string;
}

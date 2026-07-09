import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";

export class RefreshPaymentTransactionDto {
    @IsSolanaAddress()
    walletAddress: string;
}

import { IsIn } from "class-validator";
import { IsSolanaAddress } from "../../../common/validators/is-solana-address.validator";
import { PACKAGE_CODES } from "../constants/packages.constant";

export class CreateOrderDto {
    @IsIn(PACKAGE_CODES)
    packageCode: string;

    @IsSolanaAddress()
    walletAddress: string;
}

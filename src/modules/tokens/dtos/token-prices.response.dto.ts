import { TokenPriceResult } from "../types/token-price.types";

export class TokenPricesResponseDto {
    prices!: Record<string, TokenPriceResult>;
}

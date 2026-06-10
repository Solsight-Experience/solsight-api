import { TokenMetadata } from "../tokens/dtos/token.response.dto";

export type AggregatedTokenHolding = {
    amount: number;
    decimals: number;
    info?: TokenMetadata;
};

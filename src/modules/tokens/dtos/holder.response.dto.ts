import type { EnrichedHolder } from "../types/holder-aggregation.types";

export type HolderResponseDto = EnrichedHolder;

export type HoldersResponseDto = {
    holders: HolderResponseDto[];
    total: number;
    summary: {
        total_holders: number;
        top_10_holding_percent: number;
        top_20_holding_percent: number;
    };
};

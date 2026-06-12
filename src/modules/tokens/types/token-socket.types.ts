import { TradeData, TokenStats } from "./swap-event.types";
import { EnrichedHolder } from "./holder-aggregation.types";
import { TraderAggregationService } from "../services/aggregation/trader-aggregation.service";

export type TokenSocketData =
    | { token: string; price: string; timestamp: number }
    | (TokenStats & { token: string })
    | { token: string; volume: number; timestamp: number }
    | { token: string; trades: (TradeData & { token: string })[] }
    | { token: string; data: Awaited<ReturnType<TraderAggregationService["getTopTraders"]>> }
    | { token: string; changed: EnrichedHolder[]; removed: string[] };

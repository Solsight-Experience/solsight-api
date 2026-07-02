import { Between, FindOptionsWhere, In, LessThanOrEqual, MoreThanOrEqual } from "typeorm";
import { Token } from "../entities/token.entity";
import { TokenFilterConditionDto } from "../dtos/token.filter.dto";
import { TimeFrame } from "../../discovery/dtos/get-trending.dto";
import type { Cluster } from "../../../common/cluster/cluster.types";

export function resolvePriceChangeColumn(time_frame: TimeFrame): keyof Token {
    if (time_frame === TimeFrame.SEVEN_DAYS) return "priceChange7d";
    if (
        time_frame === TimeFrame.ONE_HOUR ||
        time_frame === TimeFrame.FIVE_MINUTES ||
        time_frame === TimeFrame.FIFTEEN_MINUTES ||
        time_frame === TimeFrame.THIRTY_MINUTES ||
        time_frame === TimeFrame.SIX_HOURS
    )
        return "priceChange1h";
    return "priceChange24h";
}

// Treat 0 as "not set" — 0 is the default unset value from the filter form.
function rangeOp(min: number | null | undefined, max: number | null | undefined) {
    const lo = min != null && min !== 0 ? min : null;
    const hi = max != null && max !== 0 ? max : null;
    if (lo !== null && hi !== null) return Between(lo, hi);
    if (lo !== null) return MoreThanOrEqual(lo);
    if (hi !== null) return LessThanOrEqual(hi);
    return undefined;
}

export function buildTokenFilterWhere(cluster: Cluster, filter: TokenFilterConditionDto | undefined, priceChangeColumn: keyof Token): FindOptionsWhere<Token> {
    const whereConditions: FindOptionsWhere<Token> = { network: cluster };

    if (filter?.metrics) {
        const m = filter.metrics;
        whereConditions.ageSeconds = rangeOp(
            m.age_min_minutes != null ? m.age_min_minutes * 60 : null,
            m.age_max_minutes != null ? m.age_max_minutes * 60 : null
        );
        whereConditions.liquidity = rangeOp(m.liquidity_min, m.liquidity_max);
        whereConditions.marketCap = rangeOp(m.market_cap_min, m.market_cap_max);
        whereConditions.volume24h = rangeOp(m.volume_24h_min, m.volume_24h_max);
        whereConditions.txns24hTotal = rangeOp(m.txns_24h_min, m.txns_24h_max);
        whereConditions.holdersCount = rangeOp(m.holders_min, m.holders_max);
        (whereConditions as Record<string, unknown>)[priceChangeColumn] = rangeOp(m.price_change_24h_min, m.price_change_24h_max);
    }

    if (filter?.holder_filters) {
        const h = filter.holder_filters;
        if (h.top_10_max_percent != null) whereConditions.top10Percent = LessThanOrEqual(h.top_10_max_percent);
        if (h.insider_max_percent != null) whereConditions.insiderPercent = LessThanOrEqual(h.insider_max_percent);
    }

    if (filter?.audit_filters) {
        const a = filter.audit_filters;
        if (a.mint_authority_disabled) whereConditions.mintAuthorityDisabled = true;
        if (a.freeze_authority_disabled) whereConditions.freezeAuthorityDisabled = true;
        if (a.lp_burnt) whereConditions.lpBurnt = true;
        if (a.has_social_links) whereConditions.hasSocialLinks = true;
    }

    if (filter?.categories && filter.categories.length > 0) {
        whereConditions.category = { slug: In(filter.categories) };
    }

    return whereConditions;
}

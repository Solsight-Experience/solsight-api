/**
 * Single row of the Jito tip-floor feed served at
 * `https://bundles.jito.wtf/api/v1/bundles/tip_floor`.
 *
 * The endpoint returns an array of recent samples; each row contains
 * percentile estimates of the tip lamports needed to land a bundle.
 */
export interface JitoTipFloorSample {
    time?: string;
    landed_tips_25th_percentile?: number;
    landed_tips_50th_percentile?: number;
    landed_tips_75th_percentile?: number;
    landed_tips_95th_percentile?: number;
    landed_tips_99th_percentile?: number;
    ema_landed_tips_50th_percentile?: number;
}

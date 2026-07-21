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

/**
 * JSON-RPC envelope returned by the Jito block engine `sendBundle` method.
 * `result` is the bundle id (a hash) on success; `error` is populated on failure.
 */
export interface JitoJsonRpcResponse<T> {
    jsonrpc?: string;
    id?: number;
    result?: T;
    error?: {
        code?: number;
        message?: string;
    };
}

export type JitoSendBundleResult = string;

/**
 * Result of submitting and tracking a single-transaction bundle.
 * `landed` is authoritative (Jito verifies on-chain inclusion); `status` is the
 * last observed in-flight status for diagnostics/error messaging.
 */
export interface JitoBundleResult {
    signature: string;
    bundleId: string;
    landed: boolean;
    status: JitoInflightStatus;
}

export type JitoInflightStatus = "Invalid" | "Pending" | "Failed" | "Landed";

/**
 * `getInflightBundleStatuses` response payload (JSON-RPC `result`).
 * `value` holds one entry per queried bundle id.
 */
export interface JitoInflightBundleStatuses {
    value: Array<{
        bundle_id: string;
        status: JitoInflightStatus;
        landed_slot: number | null;
    }>;
}

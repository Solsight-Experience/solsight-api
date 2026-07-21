import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import bs58 from "bs58";
import { VersionedTransaction } from "@solana/web3.js";
import { JitoBundleResult, JitoInflightBundleStatuses, JitoInflightStatus, JitoJsonRpcResponse, JitoSendBundleResult, JitoTipFloorSample } from "./jito.types";
import type { Cluster } from "../../common/cluster/cluster.types";

/** Hard minimum tip for anti-MEV bundles; the 95th percentile can dip near zero when idle. */
const ANTI_MEV_MIN_TIP_LAMPORTS = 10_000;

/** How long to poll for a bundle to land before treating it as dropped. */
const BUNDLE_STATUS_POLL_TIMEOUT_MS = 30_000;
const BUNDLE_STATUS_POLL_INTERVAL_MS = 2_000;

/**
 * Thin client over the public Jito APIs.
 *
 * - Tip-floor feed: seeds the auto-tip suggestion in `GET /swap/info`.
 * - Block engine: submits anti-MEV swaps (`antiMevRpc="sec"`) as single-transaction
 *   bundles via `sendBundle`, protecting them from front-running/sandwich attacks.
 *
 * Both endpoints are mainnet-only; devnet callers get a `ServiceUnavailableException`.
 */
@Injectable()
export class JitoService {
    private readonly logger = new Logger(JitoService.name);
    private readonly apiClient: AxiosInstance;
    private readonly blockEngineClient: AxiosInstance;

    constructor(private readonly configService: ConfigService) {
        const tipFloorUrl = this.configService.getOrThrow<string>("jito.tipFloorUrl");
        const blockEngineUrl = this.configService.getOrThrow<string>("jito.blockEngineUrl");

        this.apiClient = axios.create({
            baseURL: tipFloorUrl,
            timeout: 5000,
            headers: {
                Accept: "application/json"
            }
        });

        this.blockEngineClient = axios.create({
            baseURL: blockEngineUrl,
            timeout: 10000,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json"
            }
        });

        this.logger.log(`Jito clients initialized: tipFloor=${tipFloorUrl} blockEngine=${blockEngineUrl}`);
    }

    /**
     * Returns the latest 75th-percentile landed-tip estimate in lamports.
     *
     * Used to seed the auto-tip *display* suggestion in `GET /swap/info`. The Jito
     * feed reports values in SOL (e.g. `0.000007`); this converts to integer lamports.
     * Throws on network or shape errors; callers wrap with their own fallback.
     */
    async getLandedTip75thPercentileLamports(cluster: Cluster): Promise<number> {
        return this.fetchLandedTipLamports(cluster, "landed_tips_75th_percentile");
    }

    /**
     * Tip to embed in an anti-MEV bundle so it wins Jito's inclusion auction.
     *
     * Unlike the 75th-percentile *display* estimate, a bundle must actually out-bid
     * competitors to land, so we use the 95th percentile and clamp to a hard minimum
     * floor (the 95th can still dip to near-zero in quiet periods).
     */
    async getAntiMevTipLamports(cluster: Cluster): Promise<number> {
        const tip = await this.fetchLandedTipLamports(cluster, "landed_tips_95th_percentile");
        return Math.max(tip, ANTI_MEV_MIN_TIP_LAMPORTS);
    }

    private async fetchLandedTipLamports(cluster: Cluster, percentileKey: keyof JitoTipFloorSample): Promise<number> {
        if (cluster !== "mainnet") {
            throw new ServiceUnavailableException("Jito tip data is unavailable on devnet.");
        }

        const { data } = await this.apiClient.get<JitoTipFloorSample[]>("");

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Jito tip-floor response was empty");
        }

        const latest = data[data.length - 1];
        const tipSol = latest?.[percentileKey];

        if (typeof tipSol !== "number" || !Number.isFinite(tipSol) || tipSol < 0) {
            throw new Error(`Jito tip-floor response missing ${percentileKey}`);
        }

        return Math.round(tipSol * 1_000_000_000);
    }

    /**
     * Submits a single signed transaction as a Jito bundle, then polls the block
     * engine until the bundle lands, fails, or the poll window elapses.
     *
     * The transaction must already contain a tip to a Jito tip account (embedded by
     * the executor at build time) large enough to win the auction, or the bundle will
     * sit `Pending` and never land. Returns the on-chain signature plus the observed
     * land status so callers can surface an actionable error instead of a raw timeout.
     * Mainnet-only; throws on devnet.
     */
    async sendBundle(cluster: Cluster, signedTransactionBase64: string): Promise<JitoBundleResult> {
        if (cluster !== "mainnet") {
            throw new ServiceUnavailableException("Jito bundle submission is unavailable on devnet.");
        }

        const signature = this.extractSignature(signedTransactionBase64);

        const { data } = await this.blockEngineClient.post<JitoJsonRpcResponse<JitoSendBundleResult>>("/api/v1/bundles", {
            jsonrpc: "2.0",
            id: 1,
            method: "sendBundle",
            params: [[signedTransactionBase64], { encoding: "base64" }]
        });

        if (data.error) {
            throw new Error(`Jito sendBundle failed: ${data.error.message ?? JSON.stringify(data.error)}`);
        }

        const bundleId = data.result;
        if (!bundleId) {
            throw new Error("Jito sendBundle response missing bundle id");
        }

        this.logger.log(`Jito bundle submitted: bundleId=${bundleId} signature=${signature}`);

        const status = await this.pollBundleStatus(bundleId);
        const landed = status === "Landed";

        this.logger.log(`Jito bundle ${landed ? "landed" : "did not land"}: bundleId=${bundleId} status=${status}`);
        return { signature, bundleId, landed, status };
    }

    /**
     * Polls `getInflightBundleStatuses` until the bundle reaches a terminal state
     * (`Landed`/`Failed`/`Invalid`) or the poll window elapses (returns the last
     * observed status, typically `Pending`).
     */
    private async pollBundleStatus(bundleId: string): Promise<JitoInflightStatus> {
        const deadline = Date.now() + BUNDLE_STATUS_POLL_TIMEOUT_MS;
        let lastStatus: JitoInflightStatus = "Pending";

        while (Date.now() < deadline) {
            try {
                const { data } = await this.blockEngineClient.post<JitoJsonRpcResponse<JitoInflightBundleStatuses>>("/api/v1/getInflightBundleStatuses", {
                    jsonrpc: "2.0",
                    id: 1,
                    method: "getInflightBundleStatuses",
                    params: [[bundleId]]
                });

                const entry = data.result?.value?.find((v) => v.bundle_id === bundleId);
                if (entry) {
                    lastStatus = entry.status;
                    if (entry.status === "Landed" || entry.status === "Failed" || entry.status === "Invalid") {
                        return entry.status;
                    }
                }
            } catch (error) {
                // Transient status-endpoint errors shouldn't abort the whole submit; keep polling.
                this.logger.warn(`Jito bundle status poll error for ${bundleId}: ${error instanceof Error ? error.message : String(error)}`);
            }

            await this.delay(BUNDLE_STATUS_POLL_INTERVAL_MS);
        }

        return lastStatus;
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Reads the first (fee-payer) signature from a signed transaction and returns it
     * as a base58 string — the canonical on-chain transaction id.
     */
    private extractSignature(signedTransactionBase64: string): string {
        const tx = VersionedTransaction.deserialize(Buffer.from(signedTransactionBase64, "base64"));
        const [signature] = tx.signatures;

        if (!signature) {
            throw new Error("Signed transaction has no signatures");
        }

        return bs58.encode(signature);
    }
}

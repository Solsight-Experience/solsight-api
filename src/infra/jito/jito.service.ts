import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import bs58 from "bs58";
import { VersionedTransaction } from "@solana/web3.js";
import { JitoJsonRpcResponse, JitoSendBundleResult, JitoTipFloorSample } from "./jito.types";
import type { Cluster } from "../../common/cluster/cluster.types";

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
     * The Jito feed reports values in SOL (e.g. `0.000007`); this method
     * converts to integer lamports. Throws on network or shape errors;
     * callers are expected to wrap the call with their own fallback.
     */
    async getLandedTip75thPercentileLamports(cluster: Cluster): Promise<number> {
        if (cluster !== "mainnet") {
            throw new ServiceUnavailableException("Jito tip data is unavailable on devnet.");
        }

        const { data } = await this.apiClient.get<JitoTipFloorSample[]>("");

        if (!Array.isArray(data) || data.length === 0) {
            throw new Error("Jito tip-floor response was empty");
        }

        const latest = data[data.length - 1];
        const tipSol = latest?.landed_tips_75th_percentile;

        if (typeof tipSol !== "number" || !Number.isFinite(tipSol) || tipSol < 0) {
            throw new Error("Jito tip-floor response missing landed_tips_75th_percentile");
        }

        return Math.round(tipSol * 1_000_000_000);
    }

    /**
     * Submits a single signed transaction as a Jito bundle via the block engine's
     * `sendBundle` JSON-RPC method, protecting it from front-running.
     *
     * The transaction must already contain a tip to a Jito tip account (embedded by
     * the executor at build time), otherwise the bundle will not land.
     *
     * Returns the transaction signature (derived locally from the signed tx) so the
     * caller can confirm it on-chain. Mainnet-only; throws on devnet.
     */
    async sendBundle(cluster: Cluster, signedTransactionBase64: string): Promise<{ signature: string }> {
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

        if (!data.result) {
            throw new Error("Jito sendBundle response missing bundle id");
        }

        this.logger.log(`Jito bundle submitted: bundleId=${data.result} signature=${signature}`);
        return { signature };
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

import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { JitoTipFloorSample } from "./jito.types";
import type { Cluster } from "../../common/cluster/cluster.types";

/**
 * Thin client over the public Jito tip-floor feed.
 *
 * Used to seed the auto-tip suggestion in `GET /swap/info`. The endpoint is
 * unauthenticated and returns SOL-denominated tip percentiles, which we
 * convert to lamports for downstream consumers.
 */
@Injectable()
export class JitoService {
    private readonly logger = new Logger(JitoService.name);
    private readonly apiClient: AxiosInstance;

    constructor(private readonly configService: ConfigService) {
        const tipFloorUrl = this.configService.getOrThrow<string>("jito.tipFloorUrl");

        this.apiClient = axios.create({
            baseURL: tipFloorUrl,
            timeout: 5000,
            headers: {
                Accept: "application/json"
            }
        });

        this.logger.log(`Jito tip-floor client initialized: ${tipFloorUrl}`);
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
}

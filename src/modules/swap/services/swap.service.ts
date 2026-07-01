import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { EXECUTOR_SERVICE } from "../../../infra/executor/constants/executor.token";
import type { ExecutorService, QuoteResponse, SwapResponse } from "../../../infra/executor/interfaces/executor-service.interface";
import { JitoService } from "../../../infra/jito/jito.service";
import { KoraService } from "../../../infra/kora/kora.service";
import { SolanaService } from "../../../infra/solana/solana.service";
import { RedisService } from "../../../redis/services/redis.service";
import type { ExecuteSwapDto } from "../dtos/execute-swap.dto";
import type { GetQuoteDto } from "../dtos/get-quote.dto";
import type { GetSwapInfoDto, SwapInfoResponse } from "../dtos/get-swap-info.dto";
import type { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";
import { CachedFeeFields, CachedGaslessFields } from "../types/swap-cache.types";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { TokenPriceService } from "../../tokens/services/token-price.service";
import { TokensService } from "../../tokens/services/tokens.service";
import { COMMON_TOKEN_MINT } from "src/modules/tokens/constants/token.constant";
import { getErrorMessage, logError } from "src/common/errors/error-helper";
import axios from "axios";

const FEE_FALLBACK_PRIORITY_LAMPORTS = 100_000;
const TIP_FALLBACK_LAMPORTS = 50_000;
const MAX_FEE_BUFFER_MULTIPLIER = 3;

const FEE_CACHE_TTL_SECONDS = 5;
const KORA_CACHE_TTL_SECONDS = 60;

@Injectable()
export class SwapService {
    private readonly logger = new Logger(SwapService.name);

    constructor(
        @Inject(EXECUTOR_SERVICE) private readonly executorService: ExecutorService,
        private readonly solanaService: SolanaService,
        private readonly koraService: KoraService,
        private readonly jitoService: JitoService,
        private readonly redisService: RedisService,
        private readonly tokenPriceService: TokenPriceService,
        private readonly tokensService: TokensService
    ) {}

    async getQuote(cluster: Cluster, dto: GetQuoteDto): Promise<QuoteResponse> {
        try {
            return await this.executorService.getQuote(cluster, {
                inputMint: dto.inputMint,
                outputMint: dto.outputMint,
                amount: dto.amount,
                swapMode: dto.swapMode,
                slippageBps: dto.slippageBps
            });
        } catch (error) {
            throw this.toHttpException(error);
        }
    }

    async getSwapTransaction(cluster: Cluster, dto: GetSwapTransactionDto): Promise<SwapResponse> {
        if (!dto.gaslessFeeToken) {
            try {
                return await this.executorService.getSwapTransaction(cluster, {
                    quoteResponse: dto.quoteResponse,
                    userPublicKey: dto.userPublicKey,
                    wrapAndUnwrapSol: dto.wrapAndUnwrapSol ?? true
                });
            } catch (error) {
                throw this.toHttpException(error);
            }
        }

        if (!this.koraService.isEnabled()) {
            throw new BadRequestException("Gasless transactions are not configured on this server.");
        }

        const supportedTokens = await this.koraService.getSupportedTokens();
        if (!supportedTokens.includes(dto.gaslessFeeToken)) {
            throw new BadRequestException(`Fee token ${dto.gaslessFeeToken} is not supported by the paymaster.`);
        }

        this.logger.log(`Gasless swap requested: feeToken=${this.shortAddr(dto.gaslessFeeToken)}`);

        try {
            return await this.executorService.getSwapTransaction(cluster, {
                quoteResponse: dto.quoteResponse,
                userPublicKey: dto.userPublicKey,
                wrapAndUnwrapSol: dto.wrapAndUnwrapSol ?? true,
                feeToken: dto.gaslessFeeToken
            });
        } catch (error) {
            throw this.toHttpException(error);
        }
    }

    async executeSwap(cluster: Cluster, dto: ExecuteSwapDto): Promise<{ signature: string }> {
        let result: { signature: string };

        if (dto.gaslessFeeToken) {
            if (!this.koraService.isEnabled()) {
                throw new BadRequestException("Gasless transactions are not configured on this server.");
            }
            try {
                const koraSent = await this.koraService.signAndSendTransaction({ transaction: dto.signedTransaction });
                await this.solanaService.confirmSignature(cluster, koraSent.signature);
                result = { signature: koraSent.signature };
            } catch (error) {
                if (error instanceof HttpException) {
                    throw error;
                }
                const message = error instanceof Error ? error.message : String(error);
                throw new InternalServerErrorException(`Kora paymaster signing failed: ${message}`);
            }
        } else {
            result = await this.submitSignedTransaction(cluster, dto.signedTransaction);
        }

        return result;
    }

    async getSwapInfo(cluster: Cluster, _dto: GetSwapInfoDto): Promise<SwapInfoResponse> {
        const [feeFields, gaslessFields] = await Promise.all([this.aggregateFeeFields(cluster), this.aggregateGaslessFields(cluster)]);

        return {
            autoPriorityFeeLamports: feeFields.autoPriorityFeeLamports,
            autoTipLamports: feeFields.autoTipLamports,
            // TODO(swap-info): derive auto slippage from quote response
            autoSlippageBps: null,
            maxAutoFeeLamports: feeFields.maxAutoFeeLamports,
            gaslessEnabled: gaslessFields.gaslessEnabled,
            gaslessSupportedTokens: gaslessFields.gaslessSupportedTokens,
            payerPubkey: gaslessFields.payerPubkey
        };
    }

    async getSolPrice(cluster: Cluster): Promise<{ usd: number }> {
        const price = await this.tokenPriceService.getPrice(cluster, COMMON_TOKEN_MINT.SOL);
        return { usd: price.priceUsd };
    }

    private async submitSignedTransaction(cluster: Cluster, signedTransactionBase64: string): Promise<{ signature: string }> {
        try {
            return await this.solanaService.submitAndConfirm(cluster, signedTransactionBase64);
        } catch (error) {
            this.logger.error("Failed to execute swap", error);
            const message = error instanceof Error ? error.message : "Swap execution failed.";
            throw new HttpException(message, HttpStatus.BAD_GATEWAY);
        }
    }

    private shortAddr(address: string): string {
        if (address.length <= 8) {
            return address;
        }
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    private async aggregateFeeFields(cluster: Cluster): Promise<CachedFeeFields> {
        const cached = await this.redisService.get<CachedFeeFields>(RedisService.KEYS.SWAP_FEE_CACHE(cluster));
        if (cached) {
            return cached;
        }

        const [autoPriorityFeeLamports, autoTipLamports] = await Promise.all([this.fetchAutoPriorityFee(cluster), this.fetchAutoTip(cluster)]);

        const maxAutoFeeLamports = (autoPriorityFeeLamports + autoTipLamports) * MAX_FEE_BUFFER_MULTIPLIER;

        const fields: CachedFeeFields = {
            autoPriorityFeeLamports,
            autoTipLamports,
            maxAutoFeeLamports
        };

        await this.redisService.set(RedisService.KEYS.SWAP_FEE_CACHE(cluster), fields, FEE_CACHE_TTL_SECONDS);
        return fields;
    }

    private async aggregateGaslessFields(cluster: Cluster): Promise<CachedGaslessFields> {
        const cached = await this.redisService.get<CachedGaslessFields>(RedisService.KEYS.SWAP_KORA_CACHE(cluster));
        if (cached) {
            return cached;
        }

        const gaslessEnabled = this.koraService.isEnabled();
        let gaslessSupportedTokens: string[] = [];
        let payerPubkey: string | null = null;

        try {
            [gaslessSupportedTokens, payerPubkey] = await Promise.all([this.koraService.getSupportedTokens(), this.koraService.getPayerPubkey()]);
        } catch (error) {
            this.logger.warn(`Kora aggregation failed; serving disabled-state fallback: ${error instanceof Error ? error.message : String(error)}`);
            gaslessSupportedTokens = [];
            payerPubkey = null;
        }

        const fields: CachedGaslessFields = {
            gaslessEnabled,
            gaslessSupportedTokens,
            payerPubkey
        };

        await this.redisService.set(RedisService.KEYS.SWAP_KORA_CACHE(cluster), fields, KORA_CACHE_TTL_SECONDS);
        return fields;
    }

    private async fetchAutoPriorityFee(cluster: Cluster): Promise<number> {
        try {
            const samples = await this.solanaService.getRecentPrioritizationFees(cluster);

            if (!Array.isArray(samples) || samples.length === 0) {
                return FEE_FALLBACK_PRIORITY_LAMPORTS;
            }

            const sortedFees = samples
                .map((sample) => sample.prioritizationFee)
                .filter((fee): fee is number => typeof fee === "number" && Number.isFinite(fee))
                .sort((a, b) => a - b);

            if (sortedFees.length === 0) {
                return FEE_FALLBACK_PRIORITY_LAMPORTS;
            }

            const p75Index = Math.min(sortedFees.length - 1, Math.floor(sortedFees.length * 0.75));
            const p75 = sortedFees[p75Index];

            return p75 > 0 ? p75 : FEE_FALLBACK_PRIORITY_LAMPORTS;
        } catch (error) {
            this.logger.warn(
                `getRecentPrioritizationFees failed; using fallback ${FEE_FALLBACK_PRIORITY_LAMPORTS}: ${error instanceof Error ? error.message : String(error)}`
            );
            return FEE_FALLBACK_PRIORITY_LAMPORTS;
        }
    }

    private async fetchAutoTip(cluster: Cluster): Promise<number> {
        if (cluster === "devnet") return 0;

        try {
            return await this.jitoService.getLandedTip75thPercentileLamports(cluster);
        } catch (error) {
            this.logger.warn(`Jito tip-floor fetch failed; using fallback ${TIP_FALLBACK_LAMPORTS}: ${error instanceof Error ? error.message : String(error)}`);
            return TIP_FALLBACK_LAMPORTS;
        }
    }

    private toHttpException(error: unknown): HttpException {
        if (error instanceof HttpException) {
            return error;
        }

        logError(this.logger, "Swap quote request failed", error);

        const response = axios.isAxiosError(error) ? error.response : undefined;
        const data: unknown = response?.data;
        const isTokenNotTradable = typeof data === "object" && data !== null && (data as Record<string, unknown>)["errorCode"] === "TOKEN_NOT_TRADABLE";

        const message = isTokenNotTradable ? "This token is not tradable on Jupiter." : getErrorMessage(error);
        const status = response?.status && response.status >= 400 && response.status < 600 ? response.status : HttpStatus.BAD_GATEWAY;

        return new HttpException(message, status);
    }
}

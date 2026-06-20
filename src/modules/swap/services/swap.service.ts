import { BadRequestException, HttpException, HttpStatus, Inject, Injectable, InternalServerErrorException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CoinGeckoService } from "../../../infra/coingecko/coingecko.service";
import { EXECUTOR_SERVICE } from "../../../infra/executor/constants/executor.token";
import type { ExecutorService, QuoteResponse, SwapResponse } from "../../../infra/executor/interfaces/executor-service.interface";
import { JitoService } from "../../../infra/jito/jito.service";
import { JupiterService } from "../../../infra/jupiter/jupiter.service";
import { KoraService } from "../../../infra/kora/kora.service";
import { SolanaService } from "../../../infra/solana/solana.service";
import { RedisService } from "../../../redis/services/redis.service";
import { SwapExecution } from "../../admin-analytics/entities/swap-execution.entity";
import type { ExecuteSwapDto } from "../dtos/execute-swap.dto";
import type { GetQuoteDto } from "../dtos/get-quote.dto";
import type { GetSwapInfoDto, SwapInfoResponse } from "../dtos/get-swap-info.dto";
import type { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";
import { CachedFeeFields, CachedGaslessFields } from "../types/swap-cache.types";

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
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService,
        @InjectRepository(SwapExecution)
        private readonly swapExecutionRepo: Repository<SwapExecution>
    ) {}

    async getQuote(dto: GetQuoteDto): Promise<QuoteResponse> {
        try {
            return await this.executorService.getQuote(dto);
        } catch (error) {
            throw this.toHttpException(error);
        }
    }

    async getSwapTransaction(dto: GetSwapTransactionDto): Promise<SwapResponse> {
        if (!dto.gaslessFeeToken) {
            try {
                return await this.executorService.getSwapTransaction({
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
            return await this.executorService.getSwapTransaction({
                quoteResponse: dto.quoteResponse,
                userPublicKey: dto.userPublicKey,
                wrapAndUnwrapSol: dto.wrapAndUnwrapSol ?? true,
                feeToken: dto.gaslessFeeToken
            });
        } catch (error) {
            throw this.toHttpException(error);
        }
    }

    async executeSwap(dto: ExecuteSwapDto, userId: string | null = null): Promise<{ signature: string }> {
        let signedTransaction = dto.signedTransaction;

        if (dto.gaslessFeeToken) {
            if (!this.koraService.isEnabled()) {
                throw new BadRequestException("Gasless transactions are not configured on this server.");
            }
            try {
                const koraSigned = await this.koraService.signTransaction({ transaction: dto.signedTransaction });
                signedTransaction = koraSigned.signedTransaction;
            } catch (error) {
                if (error instanceof HttpException) {
                    throw error;
                }
                const message = error instanceof Error ? error.message : String(error);
                throw new InternalServerErrorException(`Kora paymaster signing failed: ${message}`);
            }
        }

        const result = await this.submitSignedTransaction(signedTransaction);
        this.persistSwapExecution(result.signature, dto, userId);
        return result;
    }

    async getSwapInfo(_dto: GetSwapInfoDto): Promise<SwapInfoResponse> {
        const [feeFields, gaslessFields] = await Promise.all([this.aggregateFeeFields(), this.aggregateGaslessFields()]);

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

    async getSolPrice(): Promise<{ usd: number }> {
        try {
            const prices = await this.coinGeckoService.getSimplePrice(["solana"]);
            return { usd: (prices as Record<string, { usd?: number }>)["solana"]?.usd ?? 0 };
        } catch {
            return { usd: 0 };
        }
    }

    async getTokenInfo(mint: string): Promise<{ decimals: number } | null> {
        const token = await this.jupiterService.searchToken(mint);
        if (!token) return null;
        return { decimals: token.decimals };
    }

    private async submitSignedTransaction(signedTransactionBase64: string): Promise<{ signature: string }> {
        try {
            return await this.solanaService.submitAndConfirm(signedTransactionBase64);
        } catch (error) {
            this.logger.error("Failed to execute swap", error);
            const message = error instanceof Error ? error.message : "Swap execution failed.";
            throw new HttpException(message, HttpStatus.BAD_GATEWAY);
        }
    }

    private persistSwapExecution(signature: string, dto: ExecuteSwapDto, userId: string | null): void {
        if (!dto.walletAddress || !dto.inputMint || !dto.outputMint || !dto.inAmount || !dto.outAmount) {
            return;
        }

        this.swapExecutionRepo
            .save({
                userId,
                walletAddress: dto.walletAddress,
                signature,
                inputMint: dto.inputMint,
                outputMint: dto.outputMint,
                inAmount: dto.inAmount,
                outAmount: dto.outAmount,
                volumeUsd: dto.volumeUsd ?? null
            })
            .catch((err) => this.logger.warn("Failed to persist swap execution", err));
    }

    private shortAddr(address: string): string {
        if (address.length <= 8) {
            return address;
        }
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    private async aggregateFeeFields(): Promise<CachedFeeFields> {
        const cached = await this.redisService.get<CachedFeeFields>(RedisService.KEYS.SWAP_FEE_CACHE());
        if (cached) {
            return cached;
        }

        const [autoPriorityFeeLamports, autoTipLamports] = await Promise.all([this.fetchAutoPriorityFee(), this.fetchAutoTip()]);

        const maxAutoFeeLamports = (autoPriorityFeeLamports + autoTipLamports) * MAX_FEE_BUFFER_MULTIPLIER;

        const fields: CachedFeeFields = {
            autoPriorityFeeLamports,
            autoTipLamports,
            maxAutoFeeLamports
        };

        await this.redisService.set(RedisService.KEYS.SWAP_FEE_CACHE(), fields, FEE_CACHE_TTL_SECONDS);
        return fields;
    }

    private async aggregateGaslessFields(): Promise<CachedGaslessFields> {
        const cached = await this.redisService.get<CachedGaslessFields>(RedisService.KEYS.SWAP_KORA_CACHE());
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

        await this.redisService.set(RedisService.KEYS.SWAP_KORA_CACHE(), fields, KORA_CACHE_TTL_SECONDS);
        return fields;
    }

    private async fetchAutoPriorityFee(): Promise<number> {
        try {
            const samples = await this.solanaService.getRecentPrioritizationFees();

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

    private async fetchAutoTip(): Promise<number> {
        try {
            return await this.jitoService.getLandedTip75thPercentileLamports();
        } catch (error) {
            this.logger.warn(`Jito tip-floor fetch failed; using fallback ${TIP_FALLBACK_LAMPORTS}: ${error instanceof Error ? error.message : String(error)}`);
            return TIP_FALLBACK_LAMPORTS;
        }
    }

    private toHttpException(error: unknown): HttpException {
        const axiosError = error as {
            response?: {
                status?: number;
                data?: { errorCode?: string; error?: string; message?: string };
            };
        };

        const data = axiosError?.response?.data;
        const upstreamStatus = axiosError?.response?.status;

        let message: string;
        if (data?.errorCode === "TOKEN_NOT_TRADABLE") {
            message = "This token is not tradable on Jupiter.";
        } else if (data?.message) {
            message = String(data.message);
        } else if (data?.error) {
            message = String(data.error);
        } else if (error instanceof Error) {
            message = error.message;
        } else {
            message = "Jupiter API request failed.";
        }

        const status = upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : HttpStatus.BAD_GATEWAY;

        return new HttpException(message, status);
    }
}

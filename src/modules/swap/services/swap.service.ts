import { HttpException, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { EXECUTOR_SERVICE } from "../../../infra/executor/constants/executor.token";
import type { ExecutorService, QuoteResponse, SwapResponse } from "../../../infra/executor/interfaces/executor-service.interface";
import { HeliusResolver } from "../../../infra/solana/helius.resolver";
import type { ExecuteSwapDto } from "../dtos/execute-swap.dto";
import type { GetQuoteDto } from "../dtos/get-quote.dto";
import type { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";

@Injectable()
export class SwapService {
    private readonly logger = new Logger(SwapService.name);

    constructor(
        @Inject(EXECUTOR_SERVICE) private readonly executorService: ExecutorService,
        private readonly heliusResolver: HeliusResolver
    ) {}

    async getQuote(dto: GetQuoteDto): Promise<QuoteResponse> {
        try {
            return await this.executorService.getQuote(dto);
        } catch (error) {
            throw this.toHttpException(error);
        }
    }

    async getSwapTransaction(dto: GetSwapTransactionDto): Promise<SwapResponse> {
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

    async executeSwap(dto: ExecuteSwapDto): Promise<{ signature: string }> {
        try {
            const txBuffer = Buffer.from(dto.signedTransaction, "base64");
            const rpc = this.heliusResolver.get();
            const latestBlockhash = await rpc.getLatestBlockhash();
            const signature = await rpc.sendRawTransaction(txBuffer, {
                skipPreflight: false,
                maxRetries: 3
            });
            await rpc.confirmTransaction(
                {
                    signature,
                    blockhash: latestBlockhash.blockhash,
                    lastValidBlockHeight: latestBlockhash.lastValidBlockHeight
                },
                "confirmed"
            );
            return { signature };
        } catch (error) {
            this.logger.error("Failed to execute swap", error);
            const message = error instanceof Error ? error.message : "Swap execution failed.";
            throw new HttpException(message, HttpStatus.BAD_GATEWAY);
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

        // Pass through Jupiter's status when it's a client or rate-limit error.
        // For network/unknown errors default to 502 Bad Gateway.
        const status = upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 600 ? upstreamStatus : HttpStatus.BAD_GATEWAY;

        return new HttpException(message, status);
    }
}

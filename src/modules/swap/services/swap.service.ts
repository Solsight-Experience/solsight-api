import { HttpException, HttpStatus, Inject, Injectable, Logger } from "@nestjs/common";
import { JupiterService } from "../../../infra/jupiter/jupiter.service";
import { CoinGeckoService } from "../../../infra/coingecko/coingecko.service";
import { SOLANA_RPC_SERVICE } from "../../../infra/solana/constants/solana.token";
import type { SolanaRpcService } from "../../../infra/solana/interfaces/solana-rpc-service.interface";
import type { GetQuoteDto } from "../dtos/get-quote.dto";
import type { GetSwapTransactionDto } from "../dtos/get-swap-transaction.dto";
import type { ExecuteSwapDto } from "../dtos/execute-swap.dto";
import type { QuoteResponse, SwapResponse } from "../interfaces/swap.interface";

@Injectable()
export class SwapService {
    private readonly logger = new Logger(SwapService.name);

    constructor(
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService,
        @Inject(SOLANA_RPC_SERVICE) private readonly rpcService: SolanaRpcService
    ) {}

    async getQuote(dto: GetQuoteDto): Promise<QuoteResponse> {
        try {
            return await this.jupiterService.getSwapQuote(dto);
        } catch (error) {
            throw this.toHttpException(error);
        }
    }

    async getSwapTransaction(dto: GetSwapTransactionDto): Promise<SwapResponse> {
        try {
            return await this.jupiterService.getSwapTransaction({
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
            const latestBlockhash = await this.rpcService.getLatestBlockhash();
            const signature = await this.rpcService.sendRawTransaction(txBuffer, {
                skipPreflight: false,
                maxRetries: 3
            });
            await this.rpcService.confirmTransaction(
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

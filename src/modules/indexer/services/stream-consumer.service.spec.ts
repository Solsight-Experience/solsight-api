import { StreamConsumerService } from "./stream-consumer.service";
import { TransactionStatus, TransactionType } from "../../transactions/entities/transaction.entity";
import type { MarketPriceEvent } from "../entities/market-price-event.entity";
import type { Transaction } from "../../transactions/entities/transaction.entity";
import type { Repository } from "typeorm";
import type { TokenPriceService } from "../../tokens/services/token-price.service";
import type { SwapEvent } from "../../tokens/types/swap-event.types";
import type { TokenSyncEnqueuer } from "../../tokens/services/sync/token-sync.enqueuer";

describe("StreamConsumerService", () => {
    let service: StreamConsumerService;
    let priceEventRepository: {
        create: jest.Mock;
        createQueryBuilder: jest.Mock;
    };
    let transactionRepository: {
        query: jest.Mock;
    };
    let tokenPriceService: Pick<TokenPriceService, "getPrice" | "setPrice">;
    let tokenSyncEnqueuer: Pick<TokenSyncEnqueuer, "enqueueIfUnknown">;
    let priceEventInsertExecute: jest.Mock;

    const swapBase: SwapEvent = {
        network: "mainnet",
        event_id: "evt-1",
        event_type: "swap",
        timestamp: 1_717_000_000,
        slot: 123,
        signature: "sig-1",
        maker: "maker-1",
        direction: "BUY",
        token_in: {
            mint: "quote-mint",
            symbol: "SOL",
            decimals: 9,
            amount_raw: "1000000000",
            amount_ui: 1,
            is_quote: true
        },
        token_out: {
            mint: "token-mint",
            symbol: "TOKEN",
            decimals: 6,
            amount_raw: "1000000",
            amount_ui: 1,
            is_quote: false
        },
        price_native: 0.25,
        price_usd: null,
        fee_amount_ui: 0.001
    };

    beforeEach(() => {
        priceEventInsertExecute = jest.fn().mockResolvedValue(undefined);

        priceEventRepository = {
            create: jest.fn((entity) => entity),
            createQueryBuilder: jest.fn(() => ({
                insert: jest.fn().mockReturnThis(),
                into: jest.fn().mockReturnThis(),
                values: jest.fn().mockReturnThis(),
                orIgnore: jest.fn().mockReturnThis(),
                execute: priceEventInsertExecute
            }))
        };

        transactionRepository = {
            query: jest.fn().mockResolvedValue(undefined)
        };

        tokenPriceService = {
            getPrice: jest.fn().mockResolvedValue({
                priceUsd: 0,
                priceChange24h: 0,
                source: "db"
            }),
            setPrice: jest.fn().mockResolvedValue(true)
        };
        tokenSyncEnqueuer = {
            enqueueIfUnknown: jest.fn().mockResolvedValue(undefined)
        };

        service = new StreamConsumerService(
            priceEventRepository as unknown as Repository<MarketPriceEvent>,
            transactionRepository as unknown as Repository<Transaction>,
            tokenPriceService as TokenPriceService,
            tokenSyncEnqueuer as TokenSyncEnqueuer
        );
    });

    it("writes the swap USD price through TokenPriceService before persisting", async () => {
        const swap: SwapEvent = {
            ...swapBase,
            price_usd: 42
        };

        await service.handle(swap, "ignored" as never);

        expect(tokenPriceService.setPrice).toHaveBeenCalledWith({
            cluster: "mainnet",
            mint: "token-mint",
            priceUsd: 42,
            priceNative: 0.25,
            slot: 123,
            source: "swap"
        });
        expect(priceEventRepository.create).toHaveBeenCalledWith(
            expect.objectContaining({
                price: 42,
                source: "swap"
            })
        );
    });

    it("stores null transaction USD price and skips market price events when no USD fallback exists", async () => {
        await service.handle(swapBase, "ignored" as never);

        expect(tokenPriceService.setPrice).not.toHaveBeenCalled();
        expect(priceEventInsertExecute).not.toHaveBeenCalled();
        expect(transactionRepository.query).toHaveBeenCalledWith(expect.stringContaining("INSERT INTO transactions"), [
            "sig-1",
            "mainnet",
            TransactionType.SWAP,
            TransactionStatus.CONFIRMED,
            1,
            1,
            "quote-mint",
            "token-mint",
            "maker-1",
            "123",
            new Date(swapBase.timestamp * 1000),
            JSON.stringify({
                direction: "BUY",
                price_native: 0.25,
                price_usd: null,
                fee_amount_ui: 0.001
            })
        ]);
    });

    it("uses the service fallback for the transaction without recording it as a new market-price event", async () => {
        (tokenPriceService.getPrice as jest.Mock).mockResolvedValue({
            priceUsd: 7.5,
            priceChange24h: 0,
            source: "redis"
        });

        await service.handle(swapBase, "ignored" as never);

        expect(priceEventInsertExecute).not.toHaveBeenCalled();
        expect(transactionRepository.query).toHaveBeenCalledWith(
            expect.any(String),
            expect.arrayContaining([
                JSON.stringify({
                    direction: "BUY",
                    price_native: 0.25,
                    price_usd: 7.5,
                    fee_amount_ui: 0.001
                })
            ])
        );
    });
});

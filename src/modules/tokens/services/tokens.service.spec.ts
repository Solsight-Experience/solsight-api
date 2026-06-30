import type { Repository } from "typeorm";
import type { CoinGeckoService } from "../../../infra/coingecko/coingecko.service";
import type { JupiterService } from "../../../infra/jupiter/jupiter.service";
import type { SolanaService } from "../../../infra/solana/solana.service";
import type { RedisService } from "../../../redis/services/redis.service";
import type { Holder } from "../entities/holder.entity";
import type { OhlcCandle } from "../entities/ohlc-candle.entity";
import type { Token } from "../entities/token.entity";
import type { Transaction } from "../../transactions/entities/transaction.entity";
import type { EnrichedHolder, HolderEnrichmentInput } from "../types/holder-aggregation.types";
import type { HolderAggregationService } from "./aggregation/holder-aggregation.service";
import type { OhlcAggregationService } from "./aggregation/ohlc-aggregation.service";
import { TokensService } from "./tokens.service";

describe("TokensService", () => {
    let service: TokensService;
    let holderRepository: Pick<Repository<Holder>, "findAndCount"> & {
        findAndCount: jest.Mock<Promise<[Holder[], number]>, [unknown]>;
    };
    let holderAggregationService: Pick<HolderAggregationService, "enrichHolders"> & {
        enrichHolders: jest.Mock<Promise<EnrichedHolder[]>, [string, string, HolderEnrichmentInput[]]>;
    };

    beforeEach(() => {
        holderRepository = {
            findAndCount: jest.fn()
        };
        holderAggregationService = {
            enrichHolders: jest.fn()
        };

        service = new TokensService(
            {} as Repository<Token>,
            {} as Repository<OhlcCandle>,
            holderRepository as unknown as Repository<Holder>,
            {} as Repository<Transaction>,
            {} as SolanaService,
            {} as JupiterService,
            {} as CoinGeckoService,
            {} as OhlcAggregationService,
            holderAggregationService as unknown as HolderAggregationService,
            {} as RedisService
        );
    });

    it("returns holders with total and summary metadata", async () => {
        const holderRows = [
            createHolderRow("wallet-1", "100", 1000, 5, 1),
            createHolderRow("wallet-2", "50", 900, 3, 2),
            createHolderRow("wallet-3", "25", 800, 1, 0)
        ];
        const enrichedHolders = [createEnrichedHolder("wallet-1", 12.5), createEnrichedHolder("wallet-2", 7.25), createEnrichedHolder("wallet-3", 2)];

        holderRepository.findAndCount.mockResolvedValue([holderRows, 42]);
        holderAggregationService.enrichHolders.mockResolvedValue(enrichedHolders);

        const result = await service.getHolders("devnet", "mint-address", 2);

        expect(holderRepository.findAndCount).toHaveBeenCalledWith({
            where: { tokenMint: "mint-address", network: "devnet" },
            order: { balance: "DESC" },
            take: 20
        });
        expect(holderAggregationService.enrichHolders).toHaveBeenCalledWith("mint-address", "devnet", [
            {
                wallet: "wallet-1",
                balance: "100",
                lastActiveTs: 1000,
                totalBoughtUsd: 5,
                totalSoldUsd: 1,
                buyTxCount: 2,
                sellTxCount: 1
            },
            {
                wallet: "wallet-2",
                balance: "50",
                lastActiveTs: 900,
                totalBoughtUsd: 3,
                totalSoldUsd: 2,
                buyTxCount: 2,
                sellTxCount: 1
            },
            {
                wallet: "wallet-3",
                balance: "25",
                lastActiveTs: 800,
                totalBoughtUsd: 1,
                totalSoldUsd: 0,
                buyTxCount: 2,
                sellTxCount: 1
            }
        ]);
        expect(result).toEqual({
            holders: enrichedHolders.slice(0, 2),
            total: 42,
            summary: {
                total_holders: 42,
                top_10_holding_percent: 21.75,
                top_20_holding_percent: 21.75
            }
        });
    });

    it("clamps holders limit to the endpoint maximum", async () => {
        holderRepository.findAndCount.mockResolvedValue([[], 0]);
        holderAggregationService.enrichHolders.mockResolvedValue([]);

        await service.getHolders("devnet", "mint-address", 1000);

        expect(holderRepository.findAndCount).toHaveBeenCalledWith(
            expect.objectContaining({
                take: 500
            })
        );
    });
});

function createHolderRow(wallet: string, balance: string, lastActiveTs: number, totalBoughtUsd: number, totalSoldUsd: number): Holder {
    return {
        wallet,
        balance,
        lastActiveTs,
        totalBoughtUsd,
        totalSoldUsd,
        buyTxCount: 2,
        sellTxCount: 1
    } as Holder;
}

function createEnrichedHolder(address: string, balancePercent: number): EnrichedHolder {
    return {
        address,
        name: null,
        balance: 0,
        balance_percent: balancePercent,
        avg_buy_price: 0,
        avg_sell_price: 0,
        total_bought: 0,
        total_sold: 0,
        realized_pnl: 0,
        unrealized_pnl: 0,
        total_pnl: 0,
        roi_percent: 0,
        first_tx_time: 0,
        last_tx_time: 0,
        last_active_ts: 0,
        cost_basis: 0,
        remaining_usd: 0,
        funding_label: null,
        account_type: null,
        tx_count: 0,
        buy_tx_count: 0,
        sell_tx_count: 0
    };
}

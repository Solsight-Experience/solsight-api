import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Token } from "../../entities/token.entity";
import { CoinGeckoService } from "../../../../infra/coingecko/coingecko.service";
import { logError } from "../../../../common/errors/error-helper";

const ENRICHMENT_BATCH_SIZE = 50;
const COINGECKO_ID_RESOLVE_BATCH = 10;

@Injectable()
export class CoingeckoEnrichmentService {
    private readonly logger = new Logger(CoingeckoEnrichmentService.name);

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly coinGeckoService: CoinGeckoService
    ) {}

    /**
     * Refresh price/market data on mainnet tokens that already have a coingeckoId.
     * This is the replacement for the old syncTrendingTokens/syncNewListings crons.
     * Never touches identity fields (address, symbol, name, decimals).
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async refreshMarketData(): Promise<void> {
        try {
            // Fetch all mainnet tokens with coingeckoId in batches
            let offset = 0;
            let processed = 0;

            while (true) {
                const tokens = await this.tokenRepository.find({
                    where: { network: "mainnet" },
                    select: ["id", "address", "coingeckoId"],
                    take: ENRICHMENT_BATCH_SIZE,
                    skip: offset
                });

                if (tokens.length === 0) break;

                const linked = tokens.filter((t) => t.coingeckoId);
                if (linked.length > 0) {
                    await this.enrichBatch(linked.map((t) => ({ id: t.id, address: t.address, coingeckoId: t.coingeckoId! })));
                    processed += linked.length;
                }

                offset += tokens.length;
                if (tokens.length < ENRICHMENT_BATCH_SIZE) break;
            }

            this.logger.log(`CoinGecko market data refresh complete: ${processed} tokens updated`);
        } catch (error) {
            logError(this.logger, "Failed to refresh CoinGecko market data", error);
        }
    }

    /**
     * Attempt to resolve coingeckoId for mainnet tokens that don't have one yet.
     * Runs each cron tick after market data refresh.
     */
    @Cron(CronExpression.EVERY_5_MINUTES)
    async resolveCoingeckoIds(): Promise<void> {
        try {
            const tokens = await this.tokenRepository.find({
                where: { network: "mainnet", coingeckoId: IsNull() },
                select: ["id", "address", "symbol", "name"],
                take: COINGECKO_ID_RESOLVE_BATCH,
                order: { updatedAt: "ASC" }
            });

            for (const token of tokens) {
                try {
                    const coingeckoId = await this.coinGeckoService.findCoinGeckoId("mainnet", token.symbol, token.name);
                    if (coingeckoId) {
                        await this.tokenRepository.update({ id: token.id }, { coingeckoId });
                        this.logger.debug(`Resolved coingeckoId for ${token.address}: ${coingeckoId}`);
                    }
                } catch (error) {
                    logError(this.logger, `Failed to resolve coingeckoId for ${token.address}`, error);
                }
            }
        } catch (error) {
            logError(this.logger, "Failed to resolve CoinGecko IDs", error);
        }
    }

    private async enrichBatch(tokens: { id: string; address: string; coingeckoId: string }[]): Promise<void> {
        const coinIds = tokens.map((t) => t.coingeckoId);
        const marketData = await this.coinGeckoService.getCoinsMarketData("mainnet", coinIds);
        if (marketData.length === 0) return;

        const marketMap = new Map(marketData.map((m) => [m.id, m]));

        for (const token of tokens) {
            const market = marketMap.get(token.coingeckoId);
            if (!market) continue;

            await this.tokenRepository.update(
                { id: token.id },
                {
                    price: market.current_price ?? undefined,
                    priceChange1h: market.price_change_percentage_1h_in_currency ?? undefined,
                    priceChange24h: market.price_change_percentage_24h ?? undefined,
                    priceChange7d: market.price_change_percentage_7d_in_currency ?? undefined,
                    marketCap: market.market_cap ?? undefined,
                    marketCapChange24h: market.market_cap_change_percentage_24h ?? undefined,
                    volume24h: market.total_volume ?? undefined,
                    fdv: market.fully_diluted_valuation ?? undefined,
                    circulatingSupply: market.circulating_supply ?? undefined,
                    totalSupply: market.total_supply ?? undefined,
                    maxSupply: market.max_supply ?? undefined,
                    logoUri: market.image ?? undefined
                }
            );
        }
    }
}

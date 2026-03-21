import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, FindOptionsOrderValue, ILike, Repository } from "typeorm";
import { Token } from "../entities/token.entity";
import { TokenResponseDto, TokenDetailsResponseDto } from "../dtos/token.response.dto";
import { SolanaService } from "src/infra/solana/solana.service";
import { JupiterService } from "src/infra/jupiter/jupiter.service";
import { CoinGeckoService } from "src/infra/coingecko/coingecko.service";
import { TokenFilterConditionDto, TokenFilterResponseDto } from "../dtos/token.filter.dto";
import { mapJupiterTokenToEntity, mapTokenEntityToResponseDto, mapTokenEntityToOverviewDto } from "../mapper/token.mapper";

@Injectable()
export class TokensService {
    private network: string;

    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly solanaService: SolanaService,
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService
    ) {
        this.network = this.solanaService.getNetwork();
    }

    async findOne(address: string): Promise<TokenResponseDto | null> {
        let token = await this.tokenRepository.findOneBy({ address });

        if (!token) {
            const jupiterToken = await this.jupiterService.searchToken(address);
            if (!jupiterToken) {
                return null;
            }
            const tokenData = mapJupiterTokenToEntity(jupiterToken);

            // Try to find CoinGecko ID for this token
            const coingeckoId = await this.coinGeckoService.findCoinGeckoId(jupiterToken.symbol, jupiterToken.name);
            if (coingeckoId) {
                tokenData.coingeckoId = coingeckoId;
            }

            await this.updateToken(address, tokenData);
            token = await this.tokenRepository.findOneBy({ address });
        }

        if (!token) {
            return null;
        }

        return mapTokenEntityToResponseDto(token, this.network);
    }

    async search(query: string, limit: number = 10): Promise<TokenDetailsResponseDto[]> {
        const tokens = await this.tokenRepository.find({
            where: [{ name: ILike(`%${query}%`) }, { symbol: ILike(`%${query}%`) }, { address: ILike(`%${query}%`) }],
            take: limit
        });

        return tokens.map((token) => mapTokenEntityToResponseDto(token, this.network));
    }

    async filter(
        filter: TokenFilterConditionDto,
        limit: number = 10,
        sort_by: string,
        sort_order?: "asc" | "desc",
        offset?: number
    ): Promise<TokenFilterResponseDto> {
        const orderValue: FindOptionsOrderValue = sort_order?.toUpperCase() === "ASC" ? "ASC" : "DESC";
        const SortByMap = {
            market_cap: "marketCap",
            volume_24h: "volume24h",
            txns_24h: "txns24hTotal",
            holders: "holdersCount",
            age: "ageSeconds",
            price_change_24h: "priceChange24h"
        } as const;
        const column = SortByMap[sort_by];
        const whereConditions: any = {};
        if (filter?.metrics) {
            const m = filter.metrics;

            if (m.age_min_minutes != null && m.age_max_minutes != null) {
                whereConditions.ageSeconds = Between(m.age_min_minutes, m.age_max_minutes);
            }

            if (m.liquidity_min != null && m.liquidity_max != null) {
                whereConditions.liquidity = Between(m.liquidity_min, m.liquidity_max);
            }

            if (m.market_cap_min != null && m.market_cap_max != null) {
                whereConditions.marketCap = Between(m.market_cap_min, m.market_cap_max);
            }

            if (m.volume_24h_min != null && m.volume_24h_max != null) {
                whereConditions.volume24h = Between(m.volume_24h_min, m.volume_24h_max);
            }

            if (m.txns_24h_min != null && m.txns_24h_max != null) {
                whereConditions.txns24hTotal = Between(m.txns_24h_min, m.txns_24h_max);
            }

            if (m.holders_min != null && m.holders_max != null) {
                whereConditions.holdersCount = Between(m.holders_min, m.holders_max);
            }

            if (m.price_change_24h_min != null && m.price_change_24h_max != null) {
                whereConditions.priceChange24h = Between(m.price_change_24h_min, m.price_change_24h_max);
            }
        }
        if (filter?.holder_filters) {
            const h = filter.holder_filters;

            if (h.top_10_max_percent != null) {
                whereConditions.top10Percent = Between(0, h.top_10_max_percent);
            }

            if (h.insider_max_percent != null) {
                whereConditions.insiderPercent = Between(0, h.insider_max_percent);
            }
        }
        const tokens = await this.tokenRepository.find({
            take: limit,
            skip: offset,
            relations: ["category"],
            order: column
                ? {
                      [column]: orderValue
                  }
                : undefined,
            where: [
                whereConditions,
                [{ name: ILike(`%${filter.search_query}%`) }, { symbol: ILike(`%${filter.search_query}%`) }, { address: ILike(`%${filter.search_query}%`) }]
            ]
        });

        const responseTokens = tokens.map((token) => mapTokenEntityToOverviewDto(token, this.network));

        return {
            tokens: responseTokens,
            total: responseTokens.length,
            filter_applied: filter
        };
    }

    async updateToken(address: string, data: Partial<Token>) {
        const token = await this.tokenRepository.upsert({ address, ...data }, ["address"]);
        return token;
    }
}

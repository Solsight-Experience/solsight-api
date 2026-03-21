import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, FindOptionsOrderValue, ILike, Repository } from "typeorm";
import { Token } from "../entities/token.entity";
import {
    TokenResponseDto,
    TokenDetailsResponseDto,
    TokenResponseOnchainData,
    TokenResponseMetadata,
    TokenOverviewResponseDto
} from "../dtos/token.response.dto";
import { SolanaService } from "src/infra/solana/solana.service";
import { JupiterService } from "src/infra/jupiter/jupiter.service";
import { Connection, PublicKey } from "@solana/web3.js";
import { ConfigService } from "@nestjs/config";
import { TokenFilterConditionDto, TokenFilterResponseDto } from "../dtos/token.filter.dto";

@Injectable()
export class TokensService {
    private connection: Connection;
    private network: string;
    private coingeckoListUrl: string;
    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        private readonly solanaService: SolanaService,
        private readonly jupiterService: JupiterService
    ) {
        this.connection = this.solanaService.getConnection();
        this.network = this.solanaService.getNetwork();

        const coingeckoListUrl = this.configService.get<string>("solana.coingeckoApi.searchTokenId");
        if (!coingeckoListUrl) {
            throw new Error("Coingecko search token URL is required");
        }
        this.coingeckoListUrl = coingeckoListUrl;
    }

    async findOne(address: string): Promise<TokenResponseDto | null> {
        const token = await this.tokenRepository.findOneBy({ address });
        let metadata: Partial<Token> | null = null;
        if (!token) {
            metadata = await this.jupiterService.searchToken(address);
            if (!metadata) {
                return null;
            }
            await this.updateToken(address, metadata);
        }
        const tokenMetadata = token ?? metadata;
        if (!tokenMetadata) {
            return null;
        }

        return {
            address: tokenMetadata.address
        }
    }

    async search(query: string, limit: number = 10): Promise<TokenDetailsResponseDto[]> {
        const tokens = await this.tokenRepository.find({
            where: [{ name: ILike(`%${query}%`) }, { symbol: ILike(`%${query}%`) }, { address: ILike(`%${query}%`) }],
            take: limit
        });
        const onchainDataList: TokenResponseOnchainData[] = await this.getOnchainData(tokens.map((token) => token.address));
        const result: TokenDetailsResponseDto[] = [];
        for (const [index, token] of tokens.entries()) {
            const metadataResponse: TokenResponseMetadata = {
                address: token.address,
                symbol: token.symbol,
                name: token.name,
                logo_uri: token.logoUri || null,
                network: this.network,
                description: token.description || null,
                website: token.website || null,
                social_links: {
                    twitter: token.socialLinks?.twitter || null,
                    telegram: token.socialLinks?.telegram || null,
                    discord: token.socialLinks?.discord || null
                }
            };
            result.push({ ...metadataResponse, ...onchainDataList[index] });
        }
        return result;
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
        const responseTokens: TokenOverviewResponseDto[] = tokens.map((token: Token) => {
            return {
                address: token.address ?? null,
                symbol: token.symbol ?? null,
                name: token.name ?? null,
                logo_uri: token.logoUri ?? null,
                network: this.network ?? null,
                category: null,
                age_seconds: Math.floor(new Date(token?.createdAt || new Date()).getTime() / 1000),

                price: token?.price ?? null,
                price_change_1h: token?.priceChange1h ?? null,
                price_change_24h: token?.priceChange24h ?? null,
                price_change_7d: token?.priceChange7d ?? null,

                market_cap: token?.marketCap ?? null,
                market_cap_change_24h: token?.marketCapChange24h ?? null,

                fdv: token.fdv ?? null,
                liquidity: token.liquidity ?? null,
                liquidity_change_24h: token.liquidityChange24h ?? null,

                volume_24h: token.volume24h ?? null,
                volume_change_24h: token.volumeChange24h ?? null,

                txns_24h: {
                    total: token.txns24hTotal ?? null,
                    buys: token.txns24hBuys ?? null,
                    sells: token.txns24hSells ?? null,
                    change_24h: token.txns24hChange ?? null
                },

                holders: {
                    count: token.holdersCount,
                    change_24h: token.holdersChange24h,
                    unique_wallets_24h: token.uniqueWallets24h,
                    top_10_percent: token.top10Percent,
                    insider_percent: token.insiderPercent
                },

                audit: {
                    mint_authority_disabled: token.mintAuthorityDisabled,
                    freeze_authority_disabled: token.freezeAuthorityDisabled,
                    lp_burnt: token.lpBurnt,
                    has_social_links: token.hasSocialLinks
                },
                price_sparkline: []
            };
        });

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

    // async getMetadata(address: string): Promise<Partial<Token>> {
    //     try {
    //         // const [tokenInfo, coingeckoIdList] = await Promise.all([
    //         //     this.jupiterService.searchToken(address),
    //         //     fetch(this.coingeckoListUrl).then((res) => res.json())
    //         // ]);
    //         const tokenInfo
    //         if (!tokenInfo || !coingeckoIdList) return {};
    //         // if (coingeckoIdList.length == 0) return {};
    //
    //         // const coingeckoId = coingeckoIdList.find(
    //         //     (c: any) => c.symbol.toLowerCase() == tokenInfo.symbol.toLowerCase() && c.name.toLowerCase() == tokenInfo.name.toLowerCase()
    //         // )?.id;
    //         return {
    //             address: address,
    //             symbol: tokenInfo.symbol,
    //             name: tokenInfo.name,
    //             logoUri: tokenInfo.icon || undefined,
    //             decimals: tokenInfo.decimals,
    //             website: tokenInfo.website,
    //             socialLinks: {
    //                 twitter: tokenInfo.twitter,
    //                 telegram: tokenInfo.telegram,
    //                 discord: tokenInfo.discord
    //             },
    //
    //             // Price & Market Data
    //             price: tokenInfo.usdPrice || 0,
    //             fdv: tokenInfo.fdv || 0,
    //             marketCap: tokenInfo.mcap || 0,
    //             liquidity: tokenInfo.liquidity || 0,
    //
    //             // Supply Data
    //             totalSupply: tokenInfo.totalSupply,
    //             circulatingSupply: tokenInfo.circSupply,
    //
    //             // Holder Data
    //             holdersCount: tokenInfo.holderCount || 0,
    //
    //             // 24h Statistics
    //             priceChange24h: tokenInfo.stats24h?.priceChange || 0,
    //             liquidityChange24h: tokenInfo.stats24h?.liquidityChange || 0,
    //             volumeChange24h: tokenInfo.stats24h?.volumeChange || 0,
    //             holdersChange24h: tokenInfo.stats24h?.holderChange || 0,
    //             txns24hBuys: tokenInfo.stats24h?.numBuys || 0,
    //             txns24hSells: tokenInfo.stats24h?.numSells || 0,
    //             txns24hTotal: (tokenInfo.stats24h?.numBuys || 0) + (tokenInfo.stats24h?.numSells || 0),
    //
    //             // Security Audit Data
    //             mintAuthorityDisabled: tokenInfo.audit?.mintAuthorityDisabled || false,
    //             freezeAuthorityDisabled: tokenInfo.audit?.freezeAuthorityDisabled || false,
    //             hasSocialLinks: !!(tokenInfo.twitter || tokenInfo.telegram || tokenInfo.discord)
    //         };
    //     } catch (e) {
    //         console.log("error", e);
    //         return {};
    //     }
    // }

    async getTop20Holders(mintAddresses: string[]): Promise<
        {
            mintAddress: string;
            holders: { address: string; amount: number }[];
        }[]
    > {
        const results = await Promise.all(
            mintAddresses.map(async (mintAddress) => {
                try {
                    const largestAccounts = await this.connection.getTokenLargestAccounts(new PublicKey(mintAddress));

                    const holders =
                        largestAccounts?.value?.map((acc) => ({
                            address: acc.address.toBase58(),
                            amount: acc.uiAmount ?? 0
                        })) ?? [];

                    return { mintAddress, holders };
                } catch (error) {
                    return { mintAddress, holders: [] };
                }
            })
        );

        return results;
    }

    async getOnchainData(addresses: string[]): Promise<TokenResponseOnchainData[]> {
        const result: TokenResponseOnchainData[] = [];
        const [holders, tokenPrices] = await Promise.all([this.getTop20Holders(addresses), this.jupiterService.getTokenPrices(addresses)]);
        if (!tokenPrices || tokenPrices.size === 0) return result;
        const holdersTop10AmountList = holders.map((h) => ({
            mintAddress: h.mintAddress,
            holderCount: h.holders.slice(0, 10).reduce((sum, holder) => sum + holder.amount, 0)
        }));
        const holdersTop20Amount = holders.map((h) => ({
            mintAddress: h.mintAddress,
            holderCount: h.holders.slice(0, 20).reduce((sum, holder) => sum + holder.amount, 0)
        }));
        for (const address of addresses) {
            const price = tokenPrices.get(address) || null;
            result.push({
                age_seconds: null,
                total_supply: null,
                circulating_supply: null,
                max_supply: null,

                price,
                price_change: {
                    "1h": null,
                    "24h": null,
                    "7d": null,
                    "30d": null
                },

                market_cap: null,
                market_cap_change_24h: null,

                fdv: null,
                liquidity: null,
                liquidity_change_24h: null,

                volume: {
                    "1h": 0,
                    "24h": 0,
                    "7d": 0,
                    "30d": 0
                },

                txns: {
                    "1h": {
                        total: null,
                        buys: null
                    },
                    "24h": {
                        total: null,
                        buys: null
                    },
                    "7d": {
                        total: null,
                        buys: null
                    }
                },
                txns_change_24h: 0,

                holders: {
                    count: null,
                    change_24h: null,
                    unique_wallets_24h: null,
                    top_10_percent: null,
                    top_20_percent: null,
                    insider_percent: null
                },

                audit: {
                    mint_authority: {
                        disabled: null,
                        address: "-"
                    },
                    freeze_authority: {
                        disabled: null,
                        address: "-"
                    },
                    lp_burnt_percent: null,
                    is_verified: null,
                    risk_factors: null,
                    risk_score: null
                },

                chart_data: [],
                pools: []
            });
        }
        return result;
    }
}

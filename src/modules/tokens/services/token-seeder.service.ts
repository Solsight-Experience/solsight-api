import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { Token } from "../entities/token.entity";
import { TokenListProvider, TokenInfo } from "@solana/spl-token-registry";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class TokenSeederService implements OnModuleInit {
    private readonly logger = new Logger(TokenSeederService.name);
    private coingeckoListUrl: string;

    constructor(
        private readonly configService: ConfigService,
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>
    ) {
        const coingeckoListUrl = this.configService.get<string>("solana.coingeckoApi.searchTokenId");
        if (!coingeckoListUrl) {
            throw new Error("Coingecko search token URL is required");
        }
        this.coingeckoListUrl = coingeckoListUrl;
    }

    async onModuleInit() {
        this.logger.log("Initializing TokenSeederService...");
        await this.seedTokens();
        // await this.updateTokenDecimals();
        // this.updateTokenOnChainData();
    }

    async seedTokens() {
        try {
            this.logger.log("Checking existing token data...");
            const count = await this.tokenRepository.count();
            if (count > 0) {
                this.logger.log("Token data already exists. Skipping seed.");
                return;
            }

            this.logger.log("Seeding token data...");
            await this.seekTokensBasicData();
        } catch (error) {
            this.logger.error("Failed to seed tokens", error.stack);
        }
    }

    async seekTokensBasicData() {
        try {
            const tokenListProvider = new TokenListProvider();

            const [coingeckoId, tokens] = await Promise.all([fetch(this.coingeckoListUrl).then((res) => res.json()), tokenListProvider.resolve()]);
            const tokenList = tokens
                .filterByChainId(101)
                .getList()
                .map(
                    (
                        token: TokenInfo & {
                            extensions?: TokenInfo["extensions"] & {
                                telegram?: string | undefined;
                            };
                        }
                    ) => ({
                        address: token.address,
                        symbol: token.symbol,
                        name: token.name,
                        decimals: token.decimals,
                        logoUri: token.logoURI,
                        coingeckoId: coingeckoId.find((c: any) => c.platforms?.solana == token.address)?.id || null,
                        description: token.extensions?.description,
                        website: token.extensions?.website,
                        socialLinks: {
                            twitter: token.extensions?.twitter,
                            telegram: token.extensions?.telegram,
                            discord: token.extensions?.discord
                        },
                        totalSupply: 0,
                        circulatingSupply: 0,
                        maxSupply: 0,
                        price: 0,
                        priceChange1h: 0,
                        priceChange24h: 0,
                        priceChange7d: 0,
                        marketCap: 0,
                        marketCapChange24h: 0,
                        fdv: 0,
                        liquidity: 0,
                        liquidityChange24h: 0,
                        volume24h: 0,
                        volumeChange24h: 0,
                        txns24hTotal: 0,
                        txns24hBuys: 0,
                        txns24hSells: 0,
                        txns24hChange: 0,
                        holdersCount: 0,
                        holdersChange24h: 0,
                        uniqueWallets24h: 0,
                        top10Percent: 0,
                        insiderPercent: 0,
                        mintAuthorityDisabled: false,
                        freezeAuthorityDisabled: false,
                        lpBurnt: false,
                        hasSocialLinks: false,
                        riskScore: 0,
                        riskFactors: [],
                        ageSeconds: 0,
                        priceSparkline: [],
                        createdAt: new Date(),
                        updatedAt: new Date()
                    })
                );
            const BATCH_SIZE = 1000;
            for (let i = 0; i < tokenList.length; i += BATCH_SIZE) {
                const batch = tokenList.slice(i, i + BATCH_SIZE);
                await this.tokenRepository.upsert(batch, ["address"]);
            }
            this.logger.log("Successfully seeded token data.");
        } catch (error) {
            this.logger.error("Failed to seed token data", error.stack);
        }
    }

    async updateTokenDecimals() {
        try {
            this.logger.debug("updateTokenDecimals called");
            this.logger.log("Updating token decimals...");
            const tokenListProvider = new TokenListProvider();
            const tokens = await tokenListProvider.resolve();

            const decimalsMap = new Map<string, number>(
                tokens
                    .filterByChainId(101)
                    .getList()
                    .map((token) => [token.address, token.decimals])
            );

            const allTokens = await this.tokenRepository.find({
                select: ["id", "address", "decimals"]
            });

            const toUpdate = allTokens
                .filter((t) => decimalsMap.has(t.address) && decimalsMap.get(t.address) !== t.decimals)
                .map((t) => ({ ...t, decimals: decimalsMap.get(t.address)! }));

            if (!toUpdate.length) {
                this.logger.log("All token decimals are already up to date.");
                return;
            }

            const BATCH_SIZE = 1000;
            for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
                const batch = toUpdate.slice(i, i + BATCH_SIZE);
                await this.tokenRepository.save(batch);
            }

            this.logger.log(`Updated decimals for ${toUpdate.length} tokens.`);
        } catch (error) {
            this.logger.error("Failed to update token decimals", error.stack);
        }
    }

    async updateTokenOnChainData() {
        const importantAddresses = [
            "So11111111111111111111111111111111111111112",
            "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
            "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            "2wpTofQ8SkACrkZWrZDjXPitYa8AwWgX8AfxdeBRRVLX"
        ];

        // --- Giai đoạn 1: 4 token quan trọng ---
        await this.updateBatchTokens(importantAddresses);

        // --- Giai đoạn 2: batch 60 token mỗi 70 giây ---
        const allTokens = await this.tokenRepository.find();
        const remainingTokens = allTokens.map((t) => t.address).filter((addr) => !importantAddresses.includes(addr));

        const BATCH_SIZE = 60;
        const DELAY_MS = 70 * 1000;

        for (let i = 0; i < remainingTokens.length; i += BATCH_SIZE) {
            const batch = remainingTokens.slice(i, i + BATCH_SIZE);
            await this.updateBatchTokens(batch);
            if (i + BATCH_SIZE < remainingTokens.length) {
                this.logger.log(`Waiting ${DELAY_MS / 1000}s before next batch...`);
                await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
            }
        }

        this.logger.log("Completed updating all on-chain token data.");
    }

    private async updateBatchTokens(addresses: string[]) {
        if (!addresses.length) return;

        try {
            const jupUrl = this.configService.get<string>("solana.jupiterApi.searchToken") + addresses.join(",");

            const tokensInfo: any[] = await fetch(jupUrl).then((res) => res.json());
            if (!tokensInfo?.length) return;

            const existingTokens = await this.tokenRepository.findBy({
                address: In(addresses)
            });

            const existingMap = new Map(existingTokens.map((t) => [t.address, t]));

            const updates = tokensInfo
                .filter((info) => existingMap.has(info.id))
                .map((info) => {
                    const exist = existingMap.get(info.id)!;

                    return {
                        ...exist,
                        // supply
                        totalSupply: info.totalSupply ?? exist.totalSupply,
                        circulatingSupply: info.circSupply ?? exist.circulatingSupply,

                        // price
                        price: info.usdPrice ?? exist.price,

                        priceChange1h: info.stats1h?.priceChange ?? exist.priceChange1h,

                        priceChange24h: info.stats24h?.priceChange ?? exist.priceChange24h,

                        priceChange7d: info.stats7d?.priceChange ?? exist.priceChange7d,

                        // market
                        marketCap: info.mcap ?? exist.marketCap,
                        marketCapChange24h:
                            info.stats24h?.priceChange && info.circSupply ? Number(info.stats24h.priceChange.toFixed(2)) : exist.marketCapChange24h,

                        fdv: info.fdv ?? exist.fdv,

                        // // liquidity
                        liquidity: info.liquidity ?? exist.liquidity,
                        liquidityChange24h: info.stats24h?.liquidityChange ?? exist.liquidityChange24h,

                        // volume
                        volume24h: info.stats24h?.volumeChange ?? exist.volume24h,

                        volumeChange24h: info.stats24h?.volumeChange ?? exist.volumeChange24h,

                        // audits
                        mintAuthorityDisabled: info.audit?.mintAuthorityDisabled ?? exist.mintAuthorityDisabled,

                        freezeAuthorityDisabled: info.audit?.freezeAuthorityDisabled ?? exist.freezeAuthorityDisabled,

                        updatedAt: new Date()
                    };
                });

            if (!updates.length) return;
            await this.tokenRepository.upsert(updates, {
                conflictPaths: ["address"],
                skipUpdateIfNoValuesChanged: false
            });
            this.logger.log(`Updated batch of ${addresses.length} tokens.`);
        } catch (error) {
            this.logger.error("Failed to update batch on-chain data", error.stack);
        }
    }
}

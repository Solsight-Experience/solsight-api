import { JupiterTokenMintInformation } from "src/infra/jupiter/types";
import { Token } from "../entities/token.entity";
import { TokenResponseDto, TokenResponseMetadata, TokenResponseOnchainData } from "../dtos/token.response.dto";

export function mapJupiterTokenToEntity(data: JupiterTokenMintInformation): Partial<Token> {
    const stats24h = data.stats24h;
    const stats7d = data.stats7d;
    const stats1h = data.stats1h;
    const audit = data.audit;

    // Calculate age from createdAt or firstPool.createdAt
    let ageSeconds = 0;
    const createdAtSource = data.createdAt || data.firstPool?.createdAt;
    if (createdAtSource) {
        ageSeconds = Math.floor((Date.now() - new Date(createdAtSource).getTime()) / 1000);
    }

    return {
        address: data.id,
        symbol: data.symbol,
        name: data.name,
        logoUri: data.icon ?? undefined,
        decimals: data.decimals,
        website: data.website ?? undefined,
        socialLinks: {
            twitter: data.twitter ?? undefined,
            telegram: data.telegram ?? undefined,
            discord: data.discord ?? undefined
        },

        // Price & Market Data
        price: data.usdPrice ?? 0,
        fdv: data.fdv ?? 0,
        marketCap: data.mcap ?? 0,
        liquidity: data.liquidity ?? 0,

        // Supply Data
        totalSupply: data.totalSupply ?? undefined,
        circulatingSupply: data.circSupply ?? undefined,

        // Holder Data
        holdersCount: data.holderCount ?? 0,

        // Price Changes
        priceChange1h: stats1h?.priceChange ?? 0,
        priceChange24h: stats24h?.priceChange ?? 0,
        priceChange7d: stats7d?.priceChange ?? 0,

        // 24h Statistics
        liquidityChange24h: stats24h?.liquidityChange ?? 0,
        volumeChange24h: stats24h?.volumeChange ?? 0,
        volume24h: (stats24h?.buyVolume ?? 0) + (stats24h?.sellVolume ?? 0),
        holdersChange24h: stats24h?.holderChange ?? 0,
        txns24hBuys: stats24h?.numBuys ?? 0,
        txns24hSells: stats24h?.numSells ?? 0,
        txns24hTotal: (stats24h?.numBuys ?? 0) + (stats24h?.numSells ?? 0),
        uniqueWallets24h: stats24h?.numTraders ?? 0,

        // Security Audit Data
        mintAuthorityDisabled: audit?.mintAuthorityDisabled ?? false,
        freezeAuthorityDisabled: audit?.freezeAuthorityDisabled ?? false,
        top10Percent: audit?.topHoldersPercentage ?? 0,
        hasSocialLinks: !!(data.twitter || data.telegram || data.discord),

        // Risk assessment based on organic score
        riskScore: data.organicScore != null ? Math.max(0, 100 - data.organicScore) : 50,

        // Age
        ageSeconds
    };
}

export function mapTokenEntityToResponseDto(token: Token, network: string): TokenResponseDto {
    const metadata: TokenResponseMetadata = {
        address: token.address,
        symbol: token.symbol,
        name: token.name,
        logo_uri: token.logoUri ?? null,
        network,
        description: token.description ?? null,
        website: token.website ?? null,
        social_links: {
            twitter: token.socialLinks?.twitter ?? null,
            telegram: token.socialLinks?.telegram ?? null,
            discord: token.socialLinks?.discord ?? null
        }
    };

    const onchainData: TokenResponseOnchainData = {
        age_seconds: token.ageSeconds ?? null,
        total_supply: token.totalSupply ?? null,
        circulating_supply: token.circulatingSupply ?? null,
        max_supply: token.maxSupply ?? null,

        price: token.price ?? null,
        price_change: {
            "1h": token.priceChange1h ?? null,
            "24h": token.priceChange24h ?? null,
            "7d": token.priceChange7d ?? null,
            "30d": null
        },

        market_cap: token.marketCap ?? null,
        market_cap_change_24h: token.marketCapChange24h ?? null,
        fdv: token.fdv ?? null,
        liquidity: token.liquidity ?? null,
        liquidity_change_24h: token.liquidityChange24h ?? null,

        volume: {
            "1h": null,
            "24h": token.volume24h ?? null,
            "7d": null,
            "30d": null
        },

        txns: {
            "1h": { total: null, buys: null },
            "24h": { total: token.txns24hTotal ?? null, buys: token.txns24hBuys ?? null },
            "7d": { total: null, buys: null }
        },
        txns_change_24h: token.txns24hChange ?? null,

        holders: {
            count: token.holdersCount ?? null,
            change_24h: token.holdersChange24h ?? null,
            unique_wallets_24h: token.uniqueWallets24h ?? null,
            top_10_percent: token.top10Percent ?? null,
            top_20_percent: null,
            insider_percent: token.insiderPercent ?? null
        },

        audit: {
            mint_authority: {
                disabled: token.mintAuthorityDisabled ?? null,
                address: null
            },
            freeze_authority: {
                disabled: token.freezeAuthorityDisabled ?? null,
                address: null
            },
            lp_burnt_percent: token.lpBurnt ? 100 : null,
            is_verified: null,
            risk_score: token.riskScore ?? null,
            risk_factors: token.riskFactors?.join(", ") ?? null
        },

        chart_data: [],
        pools: []
    };

    return { ...metadata, ...onchainData };
}

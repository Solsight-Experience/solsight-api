import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { FindOptionsOrder, FindOptionsOrderValue, ILike, In, Repository } from "typeorm";
import { Token } from "../../tokens/entities/token.entity";
import { Favorite } from "../entities/favorite.entity";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { FavoriteTokenDto } from "../dtos/favorite.dto";
import { TokenFilterConditionDto, TokenFilterResponseDto } from "../../tokens/dtos/token.filter.dto";
import { mapTokenEntityToOverviewDto } from "../../tokens/mapper/token.mapper";
import { resolvePriceChangeColumn, buildTokenFilterWhere } from "../../tokens/services/token-filter.util";
import { TimeFrame } from "../../discovery/dtos/get-trending.dto";

@Injectable()
export class AccountService {
    constructor(
        @InjectRepository(Token)
        private readonly tokenRepository: Repository<Token>,
        @InjectRepository(Favorite)
        private readonly favoriteRepository: Repository<Favorite>
    ) {}

    private user = {
        id: "2",
        username: "user_example",
        full_name: "Nguyễn Văn A",
        email: "user@example.com",
        phone: "0123456789",
        avatar_url: "https://example.com/avatar.jpg",
        joined_at: "2022-01-01T00:00:00Z",
        is_verified: true,
        subscription_tier: "pro",
        social_links: {
            twitter: "https://twitter.com/user",
            github: "https://github.com/user",
            website: "https://user.com"
        }
    };

    private userStats = {
        total_transactions: 120,
        transactions: {
            this_week: 5,
            this_month: 15,
            change_vs_last_week: 3
        },
        total_volume_usd: 5000,
        volume: {
            this_week: 200,
            this_month: 1000
        },
        fees_paid_total: 200,
        fees_saved_percent: 10,
        days_active: 200,
        favorite_tokens_count: 10,
        wallets_connected: 3
    };

    private wallets = [
        {
            address: "sol_wallet_1",
            name: "Sol Wallet 1",
            icon: "phantom",
            is_default: true,
            is_connected: true,
            added_at: "2022-03-01T00:00:00Z",
            balance_sol: 10.5,
            balance_usd: 300
        },
        {
            address: "sol_wallet_2",
            name: "Sol Wallet 2",
            icon: "backpack",
            is_default: false,
            is_connected: true,
            added_at: "2022-04-01T00:00:00Z",
            balance_sol: 5.0,
            balance_usd: 150
        }
    ];

    getUserProfile() {
        return this.user;
    }

    getUserStats() {
        return this.userStats;
    }

    async getFavorites(userId: string, cluster: Cluster): Promise<FavoriteTokenDto[]> {
        const favorites = await this.favoriteRepository.find({
            where: { userId, network: cluster },
            order: { createdAt: "DESC" }
        });

        const result: FavoriteTokenDto[] = [];
        for (const fav of favorites) {
            const token = await this.tokenRepository.findOne({
                where: { address: fav.tokenAddress, network: cluster },
                relations: ["category"]
            });

            result.push({
                token_address: fav.tokenAddress,
                added_at: fav.createdAt.toISOString(),
                token: token ? mapTokenEntityToOverviewDto(token, cluster) : null
            });
        }
        return result;
    }

    async addFavorite(userId: string, cluster: Cluster, tokenAddress: string) {
        const exists = await this.favoriteRepository.findOne({ where: { userId, tokenAddress, network: cluster } });
        if (exists) {
            return { success: true, message: "Token already in favorites" };
        }

        await this.favoriteRepository.save(this.favoriteRepository.create({ userId, tokenAddress, network: cluster }));

        return { success: true, message: "Token added to favorites" };
    }

    async removeFavorite(userId: string, cluster: Cluster, tokenAddress: string) {
        const result = await this.favoriteRepository.delete({ userId, tokenAddress, network: cluster });

        if (result.affected) {
            return { success: true, message: "Token removed from favorites" };
        }

        return { success: false, message: "Token not found in favorites" };
    }

    async filterFavorites(
        userId: string,
        cluster: Cluster,
        filter: TokenFilterConditionDto,
        limit: number = 10,
        sort_by: string,
        sort_order?: "asc" | "desc",
        offset?: number
    ): Promise<TokenFilterResponseDto> {
        const favorites = await this.favoriteRepository.find({ where: { userId, network: cluster } });
        const favoriteAddresses = favorites.map((fav) => fav.tokenAddress);

        if (favoriteAddresses.length === 0) {
            return { tokens: [], total: 0, filter_applied: filter };
        }

        const time_frame = filter?.time_frame ?? TimeFrame.TWENTY_FOUR_HOURS;
        const priceChangeColumn = resolvePriceChangeColumn(time_frame);
        const orderValue: FindOptionsOrderValue = sort_order?.toUpperCase() === "ASC" ? "ASC" : "DESC";

        const SortByMap: Record<string, string> = {
            market_cap: "marketCap",
            volume_24h: "volume24h",
            txns_24h: "txns24hTotal",
            holders: "holdersCount",
            age: "ageSeconds",
            price_change_24h: priceChangeColumn
        };
        const column = SortByMap[sort_by];

        const whereConditions = buildTokenFilterWhere(cluster, filter, priceChangeColumn);
        whereConditions.address = In(favoriteAddresses);

        // Address is already pinned to the favorites set above, so search only
        // branches on name/symbol — an address-ILike branch would overwrite the
        // In(favoriteAddresses) constraint since a where object holds one value per key.
        const where = filter?.search_query
            ? [
                  { ...whereConditions, name: ILike(`%${filter.search_query}%`) },
                  { ...whereConditions, symbol: ILike(`%${filter.search_query}%`) }
              ]
            : whereConditions;

        const tokens = await this.tokenRepository.find({
            take: limit,
            skip: offset,
            relations: ["category"],
            order: column ? ({ [column]: orderValue } as FindOptionsOrder<Token>) : undefined,
            where
        });

        const responseTokens = tokens.map((token) => mapTokenEntityToOverviewDto(token, cluster));

        return {
            tokens: responseTokens,
            total: responseTokens.length,
            filter_applied: filter
        };
    }

    getWallets() {
        return {
            wallets: this.wallets,
            total_wallets: this.wallets.length,
            total_balance_sol: this.wallets.reduce((total, w) => total + w.balance_sol, 0),
            total_balance_usd: this.wallets.reduce((total, w) => total + w.balance_usd, 0)
        };
    }
}

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { FavoriteToken } from "../entities/favorite-token.entity";
import { Token } from "../../tokens/entities/token.entity";

@Injectable()
export class AccountService {
    constructor(
        @InjectRepository(FavoriteToken)
        private readonly favoriteTokenRepo: Repository<FavoriteToken>,
        @InjectRepository(Token)
        private readonly tokenRepo: Repository<Token>
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

    getUserProfile(userId: string) {
        // TODO: wire real user profile; currently mock
        return { ...this.user, id: userId };
    }

    async getUserStats(userId: string) {
        const favoriteCount = await this.favoriteTokenRepo.count({ where: { userId } });
        return { ...this.userStats, favorite_tokens_count: favoriteCount };
    }

    async getFavorites(userId: string) {
        const favorites = await this.favoriteTokenRepo.find({
            where: { userId },
            order: { createdAt: "DESC" }
        });

        const items = await Promise.all(
            favorites.map(async (fav) => {
                const token = await this.tokenRepo.findOne({
                    where: { address: fav.tokenAddress, network: fav.network }
                });

                return {
                    token_address: fav.tokenAddress,
                    network: fav.network,
                    added_at: fav.createdAt.toISOString(),
                    token: token
                        ? {
                              address: token.address,
                              network: token.network,
                              name: token.name,
                              symbol: token.symbol,
                              price_usd: Number(token.price)
                          }
                        : null
                };
            })
        );

        return { favorites: items, total: items.length };
    }

    async addFavorite(userId: string, tokenAddress: string, network = "mainnet") {
        const existing = await this.favoriteTokenRepo.findOne({
            where: { userId, tokenAddress, network }
        });
        if (existing) {
            return { success: true, message: "Token already in favorites" };
        }

        const entity = this.favoriteTokenRepo.create({
            userId,
            tokenAddress,
            network
        });
        await this.favoriteTokenRepo.save(entity);

        return { success: true, message: "Token added to favorites" };
    }

    async removeFavorite(userId: string, tokenAddress: string, network = "mainnet") {
        const entity = await this.favoriteTokenRepo.findOne({
            where: { userId, tokenAddress, network }
        });

        if (!entity) {
            return { success: false, message: "Token not found in favorites" };
        }

        await this.favoriteTokenRepo.remove(entity);
        return { success: true, message: "Token removed from favorites" };
    }

    getWallets(userId: string) {
        return {
            userId,
            wallets: this.wallets,
            total_wallets: this.wallets.length,
            total_balance_sol: this.wallets.reduce((total, w) => total + w.balance_sol, 0),
            total_balance_usd: this.wallets.reduce((total, w) => total + w.balance_usd, 0)
        };
    }
}

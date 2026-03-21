import { Injectable } from "@nestjs/common";

@Injectable()
export class AccountService {
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

    private favorites = [
        {
            token_address: "0x12345",
            added_at: "2023-01-01T00:00:00Z",
            token: {
                name: "Token1",
                symbol: "T1",
                price_usd: 10
            }
        },
        {
            token_address: "0x67890",
            added_at: "2023-02-01T00:00:00Z",
            token: {
                name: "Token2",
                symbol: "T2",
                price_usd: 20
            }
        }
    ];

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

    getFavorites() {
        return this.favorites;
    }

    addFavorite(tokenAddress: string) {
        // Check if already exists
        const exists = this.favorites.find((fav) => fav.token_address === tokenAddress);
        if (exists) {
            return { success: true, message: "Token already in favorites" };
        }

        // Add to favorites
        this.favorites.push({
            token_address: tokenAddress,
            added_at: new Date().toISOString(),
            token: {
                name: "Unknown Token",
                symbol: "UNK",
                price_usd: 0
            }
        });

        return { success: true, message: "Token added to favorites" };
    }

    removeFavorite(tokenAddress: string) {
        const initialLength = this.favorites.length;
        this.favorites = this.favorites.filter((fav) => fav.token_address !== tokenAddress);

        if (this.favorites.length < initialLength) {
            return { success: true, message: "Token removed from favorites" };
        }

        return { success: false, message: "Token not found in favorites" };
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

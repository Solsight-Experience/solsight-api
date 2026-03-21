import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Wallet } from "../entities/wallet.entity";
import { CreateWalletDto } from "../dtos/create-wallet.dto";
import { SolanaService } from "../../../infra/solana/solana.service";
import { PublicKey } from "@solana/web3.js";
import { WalletsResponse, Position, WalletSummary, Wallet as WalletDto } from "../dtos/wallet.response.dto";
import { JupiterService } from "../../../infra/jupiter/jupiter.service";
import { CoinGeckoService } from "../../../infra/coingecko/coingecko.service";

@Injectable()
export class WalletsService {
    constructor(
        @InjectRepository(Wallet)
        private readonly walletRepository: Repository<Wallet>,
        private readonly solanaService: SolanaService,
        private readonly jupiterService: JupiterService,
        private readonly coinGeckoService: CoinGeckoService
    ) {}

    async createWithNonce(address: string, nonce: string): Promise<Wallet> {
        const wallet = this.walletRepository.create({
            address,
            nonce,
            chain: "SOL"
        });
        return this.walletRepository.save(wallet);
    }

    async updateNonce(walletId: string, nonce: string | null): Promise<void> {
        await this.walletRepository.update(walletId, { nonce });
    }

    async updateUser(walletId: string, userId: string, icon?: string): Promise<void> {
        await this.walletRepository.update(walletId, { userId, icon: icon as any });
    }

    async create(userId: string, createWalletDto: CreateWalletDto): Promise<Wallet> {
        // Validate Solana address
        if (!this.solanaService.validatePublicKey(createWalletDto.address)) {
            throw new BadRequestException("Invalid Solana wallet address");
        }

        // Check if wallet already exists
        const existingWallet = await this.walletRepository.findOne({
            where: { address: createWalletDto.address }
        });

        if (existingWallet) {
            throw new ConflictException("Wallet already exists");
        }

        const wallet = this.walletRepository.create({
            ...createWalletDto,
            // cast icon to enum type if provided
            icon: createWalletDto.icon ? (createWalletDto.icon as any) : undefined,
            userId
        });

        const savedWallet = await this.walletRepository.save(wallet);

        // Update balance from blockchain
        await this.updateBalance(savedWallet.id);

        return savedWallet;
    }

    async findByUserId(userId: string): Promise<Wallet[]> {
        return await this.walletRepository.find({
            where: { userId },
            order: { createdAt: "DESC" }
        });
    }

    async listForUser(userId: string): Promise<WalletsResponse> {
        const wallets = await this.findByUserId(userId);

        // Auto-update balances for all user wallets
        try {
            await Promise.all(wallets.map((wallet) => this.updateBalance(wallet.id)));
        } catch (error) {
            // Log the error but don't block the response if updates fail
            console.error("Failed to update one or more wallet balances", error);
        }

        // Refetch wallets to get the potentially updated balances
        const updatedWallets = await this.findByUserId(userId);

        const solPrice = await this.getSolPriceUsd();

        // Get detailed wallet info with positions
        const walletsWithDetails = await Promise.all(updatedWallets.map((w) => this.getWalletDetail(w, solPrice)));

        const total_wallets = walletsWithDetails.length;
        const total_balance_sol = walletsWithDetails.reduce((acc, w) => acc + w.balance_sol, 0);
        const total_balance_usd = walletsWithDetails.reduce((acc, w) => acc + w.balance_usd, 0);

        return {
            wallets: walletsWithDetails,
            total_wallets,
            total_balance_sol,
            total_balance_usd
        };
    }

    private async getWalletDetail(wallet: Wallet, solPrice: number): Promise<WalletDto> {
        const positions = await this.getWalletPositions(wallet.address);
        const summary = this.calculateWalletSummary(positions);

        return {
            address: wallet.address,
            name: wallet.name || "",
            icon: (wallet as any).icon || "",
            is_default: !!wallet.isDefault,
            is_connected: !!wallet.isConnected,
            added_at: wallet.createdAt,
            balance_sol: Number(wallet.balance || 0),
            balance_usd: Number(wallet.balance || 0) * solPrice,
            positions,
            summary
        };
    }

    private async getWalletPositions(walletAddress: string): Promise<Position[]> {
        try {
            const publicKey = new PublicKey(walletAddress);
            const tokenAccounts = await this.solanaService.getParsedTokenAccountsByOwner(publicKey);

            const positions: Position[] = [];

            for (const account of tokenAccounts) {
                const parsedInfo = account.account.data.parsed.info;
                const mintAddress = parsedInfo.mint;
                const balance = parsedInfo.tokenAmount.uiAmount;

                if (balance === 0) continue; // Skip empty accounts

                // Get token info from Jupiter
                let tokenInfo;
                try {
                    tokenInfo = await this.jupiterService.getTokenInfo(mintAddress);
                } catch (error) {
                    console.error("Failed to get token info from Jupiter", error);
                }

                if (!tokenInfo) {
                    // Skip tokens not found in Jupiter list
                    continue;
                }

                // Get price from Jupiter
                let priceUsd = 0;
                const priceChange24h = 0; // TODO: Get price change from CoinGecko if needed
                try {
                    const price = await this.jupiterService.getTokenPrice(mintAddress);
                    priceUsd = price || 0;
                } catch (error) {
                    console.error("Failed to get price from Jupiter", error);
                }

                const valueUsd = balance * priceUsd;

                positions.push({
                    token_address: mintAddress,
                    token_symbol: tokenInfo.symbol,
                    token_name: tokenInfo.name,
                    token_logo: tokenInfo.logoURI || "",
                    balance,
                    price_usd: priceUsd,
                    value_usd: valueUsd,
                    price_change_24h: priceChange24h
                });
            }

            // Sort by value descending
            return positions.sort((a, b) => b.value_usd - a.value_usd);
        } catch (error) {
            console.error("Failed to get wallet positions", error);
            return [];
        }
    }

    private calculateWalletSummary(positions: Position[]): WalletSummary {
        const total_tokens = positions.length;
        const total_value_usd = positions.reduce((acc, p) => acc + p.value_usd, 0);
        const total_pnl_24h = positions.reduce((acc, p) => acc + (p.value_usd * p.price_change_24h) / 100, 0);
        const total_pnl_24h_percent = total_value_usd > 0 ? (total_pnl_24h / total_value_usd) * 100 : 0;

        return {
            total_tokens,
            total_value_usd,
            total_pnl_24h,
            total_pnl_24h_percent
        };
    }

    async findById(id: string): Promise<Wallet> {
        const wallet = await this.walletRepository.findOne({
            where: { id },
            relations: ["user"]
        });

        if (!wallet) {
            throw new NotFoundException("Wallet not found");
        }

        return wallet;
    }

    async findByAddress(address: string): Promise<Wallet> {
        const wallet = await this.walletRepository.findOne({
            where: { address },
            relations: ["user"]
        });

        if (!wallet) {
            throw new NotFoundException("Wallet not found");
        }

        return wallet;
    }

    async findOneByAddress(address: string): Promise<Wallet | null> {
        return this.walletRepository.findOne({
            where: { address },
            relations: ["user"]
        });
    }
    async getWalletByAddress(userId: string, address: string): Promise<WalletDto> {
        const wallet = await this.walletRepository.findOne({
            where: { address, userId }
        });

        if (!wallet) {
            throw new NotFoundException("Wallet not found");
        }

        // Update balance
        try {
            await this.updateBalance(wallet.id);
        } catch (error) {
            console.error("Failed to update wallet balance", error);
        }

        // Refetch with updated balance
        const updatedWallet = await this.findById(wallet.id);
        const solPrice = await this.getSolPriceUsd();

        return await this.getWalletDetail(updatedWallet, solPrice);
    }

    async updateBalance(walletId: string): Promise<Wallet> {
        const wallet = await this.findById(walletId);

        try {
            const publicKey = new PublicKey(wallet.address);
            const balance = await this.solanaService.getBalance(publicKey);

            await this.walletRepository.update({ id: walletId }, { balance });

            return await this.findById(walletId);
        } catch {
            throw new BadRequestException("Failed to update wallet balance");
        }
    }

    async getTokenBalance(walletId: string, mintAddress: string): Promise<number> {
        const wallet = await this.findById(walletId);

        try {
            const walletPublicKey = new PublicKey(wallet.address);
            const mintPublicKey = new PublicKey(mintAddress);

            return await this.solanaService.getTokenBalance(walletPublicKey, mintPublicKey);
        } catch {
            throw new BadRequestException("Failed to get token balance");
        }
    }

    async getTransactionHistory(walletId: string, limit = 10) {
        const wallet = await this.findById(walletId);

        try {
            const publicKey = new PublicKey(wallet.address);
            return await this.solanaService.getTransactionHistory(publicKey, limit);
        } catch {
            throw new BadRequestException("Failed to get transaction history");
        }
    }

    async update(id: string, updateData: Partial<Wallet>): Promise<Wallet> {
        const wallet = await this.findById(id);

        if (updateData.address && updateData.address !== wallet.address) {
            if (!this.solanaService.validatePublicKey(updateData.address)) {
                throw new BadRequestException("Invalid Solana wallet address");
            }

            const existingWallet = await this.walletRepository.findOne({
                where: { address: updateData.address, userId: wallet.userId }
            });

            if (existingWallet && existingWallet.id !== id) {
                throw new ConflictException("Wallet address already exists for this user");
            }
        }

        await this.walletRepository.update({ id }, updateData);
        return await this.findById(id);
    }

    async updateByAddress(userId: string, address: string, updateData: Partial<Wallet>) {
        const wallet = await this.walletRepository.findOne({
            where: { address, userId }
        });
        if (!wallet) throw new NotFoundException("Wallet not found");

        await this.walletRepository.update({ id: wallet.id }, updateData);
        return await this.findById(wallet.id);
    }

    async deleteByAddress(userId: string, address: string): Promise<void> {
        const wallet = await this.walletRepository.findOne({
            where: { address, userId }
        });
        if (!wallet) throw new NotFoundException("Wallet not found");
        await this.walletRepository.remove(wallet);
    }

    async setDefaultForAddress(userId: string, address: string): Promise<Wallet> {
        const wallet = await this.walletRepository.findOne({
            where: { address, userId }
        });
        if (!wallet) throw new NotFoundException("Wallet not found");

        // unset other wallets
        await this.walletRepository.update({ userId }, { isDefault: false });

        await this.walletRepository.update({ id: wallet.id }, { isDefault: true });
        return await this.findById(wallet.id);
    }

    // Get SOL price in USD from CoinGecko
    private async getSolPriceUsd(): Promise<number> {
        try {
            const marketData = await this.coinGeckoService.getCoinsMarketData(["solana"], "usd");
            if (marketData && marketData.length > 0) {
                return marketData[0].current_price;
            }
            return 0;
        } catch (error) {
            console.error("Failed to get SOL price from CoinGecko", error);
            return 0;
        }
    }

    async delete(id: string): Promise<void> {
        const wallet = await this.findById(id);
        await this.walletRepository.remove(wallet);
    }

    async verifyWallet(walletId: string): Promise<Wallet> {
        return await this.update(walletId, { isVerified: true });
    }

    async deactivateWallet(walletId: string): Promise<Wallet> {
        return await this.update(walletId, { isActive: false });
    }

    async activateWallet(walletId: string): Promise<Wallet> {
        return await this.update(walletId, { isActive: true });
    }
}

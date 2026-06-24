import { Injectable, Logger, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Wallet, WalletIcon } from "../entities/wallet.entity";
import { CreateWalletDto } from "../dtos/create-wallet.dto";
import { SolanaService } from "../../../infra/solana/solana.service";
import { PublicKey } from "@solana/web3.js";
import { ParsedTokenAccount } from "../../../infra/solana/solana.types";
import { WalletsResponse, Position, WalletSummary, Wallet as WalletDto } from "../dtos/wallet.response.dto";
import { TokensService } from "../../tokens/services/tokens.service";
import { TokenPriceService } from "src/modules/tokens/services/token-price.service";
import { COMMON_TOKEN_MINT } from "src/modules/tokens/constants/token.constant";

@Injectable()
export class WalletsService {
    private readonly logger = new Logger(WalletsService.name);

    constructor(
        @InjectRepository(Wallet)
        private readonly walletRepository: Repository<Wallet>,
        private readonly solanaService: SolanaService,
        private readonly tokensService: TokensService,
        private readonly tokenPriceService: TokenPriceService
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

    async updateUser(walletId: string, userId: string, icon?: WalletIcon): Promise<void> {
        await this.walletRepository.update(walletId, { userId, icon });
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
            icon: createWalletDto.icon,
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
            this.logger.error("Failed to update one or more wallet balances", error);
        }

        // Refetch wallets to get the potentially updated balances
        const updatedWallets = await this.findByUserId(userId);

        const solPrice = await this.tokenPriceService.getPrice(COMMON_TOKEN_MINT.SOL);

        // Get detailed wallet info with positions
        const walletsWithDetails = await Promise.all(updatedWallets.map((w) => this.getWalletDetail(w, solPrice.priceUsd)));

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
            icon: wallet.icon || "",
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
            const tokenAccounts: ParsedTokenAccount[] = await this.solanaService.getParsedTokenAccountsByOwner(publicKey);

            const holdings: Array<{ mintAddress: string; balance: number }> = [];
            for (const account of tokenAccounts) {
                const parsedInfo = account.account.data.parsed.info;
                const balance = parsedInfo.tokenAmount.uiAmount ?? 0;
                if (balance === 0) continue;
                holdings.push({ mintAddress: parsedInfo.mint, balance });
            }

            if (holdings.length === 0) return [];

            const mints = holdings.map((h) => h.mintAddress);
            const [metadataMap, priceMap] = await Promise.all([this.tokensService.findMany(mints), this.tokenPriceService.getPrices(mints)]);

            const positions: Position[] = [];
            for (const { mintAddress, balance } of holdings) {
                const meta = metadataMap.get(mintAddress);
                if (!meta) continue;

                const { priceUsd, priceChange24h } = priceMap.get(mintAddress) ?? { priceUsd: 0, priceChange24h: 0 };

                positions.push({
                    token_address: mintAddress,
                    token_symbol: meta.symbol,
                    token_name: meta.name,
                    token_logo: meta.logoUri ?? "",
                    balance,
                    price_usd: priceUsd,
                    value_usd: balance * priceUsd,
                    price_change_24h: priceChange24h
                });
            }

            return positions.sort((a, b) => b.value_usd - a.value_usd);
        } catch (error) {
            this.logger.error("Failed to get wallet positions", error);
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
            this.logger.error("Failed to update wallet balance", error);
        }

        // Refetch with updated balance
        const updatedWallet = await this.findById(wallet.id);
        const solPrice = await this.tokenPriceService.getPrice(COMMON_TOKEN_MINT.SOL);

        return await this.getWalletDetail(updatedWallet, solPrice.priceUsd);
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

        this.walletRepository.merge(wallet, updateData);
        return await this.walletRepository.save(wallet);
    }

    async updateByAddress(userId: string, address: string, updateData: Partial<Wallet>) {
        const wallet = await this.walletRepository.findOne({
            where: { address, userId }
        });
        if (!wallet) throw new NotFoundException("Wallet not found");

        this.walletRepository.merge(wallet, updateData);
        await this.walletRepository.save(wallet);
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

    async deleteAllByUserId(userId: string): Promise<void> {
        const wallets = await this.findByUserId(userId);
        if (wallets.length > 0) {
            await this.walletRepository.remove(wallets);
        }
    }
}

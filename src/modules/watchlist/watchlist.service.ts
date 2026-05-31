import { Injectable, ConflictException, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WatchedWallet } from "./entities/watched-wallet.entity";
import { AddWatchedWalletDto, UpdateWatchedWalletDto } from "./dtos/add-watched-wallet.dto";

@Injectable()
export class WatchlistService {
    constructor(
        @InjectRepository(WatchedWallet)
        private readonly watchedWalletRepo: Repository<WatchedWallet>
    ) {}

    async findByUserId(userId: string) {
        const wallets = await this.watchedWalletRepo.find({
            where: { userId },
            order: { createdAt: "DESC" }
        });
        return { wallets, total: wallets.length };
    }

    async add(userId: string, dto: AddWatchedWalletDto): Promise<WatchedWallet> {
        const existing = await this.watchedWalletRepo.findOne({
            where: { userId, walletAddress: dto.walletAddress }
        });
        if (existing) {
            throw new ConflictException("Wallet already in watchlist");
        }
        const entity = this.watchedWalletRepo.create({
            userId,
            walletAddress: dto.walletAddress,
            label: dto.label
        });
        return this.watchedWalletRepo.save(entity);
    }

    async update(userId: string, walletAddress: string, dto: UpdateWatchedWalletDto): Promise<WatchedWallet> {
        const entity = await this.watchedWalletRepo.findOne({
            where: { userId, walletAddress }
        });
        if (!entity) {
            throw new NotFoundException("Watched wallet not found");
        }
        entity.label = dto.label;
        return this.watchedWalletRepo.save(entity);
    }

    async remove(userId: string, walletAddress: string): Promise<{ success: boolean }> {
        const entity = await this.watchedWalletRepo.findOne({
            where: { userId, walletAddress }
        });
        if (!entity) {
            throw new NotFoundException("Watched wallet not found");
        }
        await this.watchedWalletRepo.remove(entity);
        return { success: true };
    }
}

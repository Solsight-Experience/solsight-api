import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WalletAlert } from "./entities/wallet-alert.entity";
import { WatchedWallet } from "./entities/watched-wallet.entity";
import { CreateWalletAlertDto, UpdateWalletAlertDto } from "./dtos/wallet-alert.dto";

@Injectable()
export class WalletAlertService {
    constructor(
        @InjectRepository(WalletAlert)
        private readonly alertRepo: Repository<WalletAlert>,
        @InjectRepository(WatchedWallet)
        private readonly watchedWalletRepo: Repository<WatchedWallet>
    ) {}

    async getAlertsForWallet(userId: string, walletAddress: string): Promise<WalletAlert[]> {
        return this.alertRepo.find({
            where: { userId, walletAddress },
            order: { createdAt: "DESC" }
        });
    }

    async getAllActiveAlertsForWallet(walletAddress: string): Promise<WalletAlert[]> {
        return this.alertRepo.find({ where: { isActive: true, walletAddress }, relations: ["watchedWallet"] });
    }

    async create(userId: string, walletAddress: string, dto: CreateWalletAlertDto): Promise<WalletAlert> {
        const network = dto.network ?? "mainnet";
        const watchedWallet = await this.watchedWalletRepo.findOne({ where: { userId, walletAddress, network } });
        if (!watchedWallet) throw new NotFoundException("Watched wallet not found");

        const alert = this.alertRepo.create({
            userId,
            walletAddress,
            watchedWalletId: watchedWallet.id,
            alertType: dto.alertType,
            condition: dto.condition
        });
        return this.alertRepo.save(alert);
    }

    async update(userId: string, alertId: string, dto: UpdateWalletAlertDto): Promise<WalletAlert> {
        const alert = await this.alertRepo.findOne({ where: { id: alertId, userId } });
        if (!alert) throw new NotFoundException("Alert not found");
        if (dto.isActive !== undefined) alert.isActive = dto.isActive;
        if (dto.condition !== undefined) alert.condition = dto.condition;
        return this.alertRepo.save(alert);
    }

    async updateLastChecked(alertId: string, signature: string): Promise<void> {
        await this.alertRepo.update(alertId, { lastCheckedSignature: signature });
    }

    async delete(userId: string, alertId: string): Promise<{ success: boolean }> {
        const alert = await this.alertRepo.findOne({ where: { id: alertId, userId } });
        if (!alert) throw new NotFoundException("Alert not found");
        await this.alertRepo.remove(alert);
        return { success: true };
    }
}

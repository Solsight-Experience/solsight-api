import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WatchlistService } from "./watchlist.service";
import { WalletAlertService } from "./wallet-alert.service";
import { AddWatchedWalletDto, UpdateWatchedWalletDto } from "./dtos/add-watched-wallet.dto";
import { CreateWalletAlertDto, UpdateWalletAlertDto } from "./dtos/wallet-alert.dto";
import { AuthenticatedRequest } from "../../common/guards/guard.type";

@Controller("watchlist")
@UseGuards(JwtAuthGuard)
export class WatchlistController {
    constructor(
        private readonly watchlistService: WatchlistService,
        private readonly walletAlertService: WalletAlertService
    ) {}

    // ── Watchlist CRUD ────────────────────────────────────────────────────────

    @Get()
    async getWatchlist(@Request() req: AuthenticatedRequest) {
        return this.watchlistService.findByUserId(req.user.id);
    }

    @Post()
    async addWallet(@Request() req: AuthenticatedRequest, @Body() dto: AddWatchedWalletDto) {
        return this.watchlistService.add(req.user.id, dto);
    }

    @Patch(":address")
    async updateWallet(@Request() req: AuthenticatedRequest, @Param("address") address: string, @Body() dto: UpdateWatchedWalletDto) {
        return this.watchlistService.update(req.user.id, address, dto);
    }

    @Delete(":address")
    async removeWallet(@Request() req: AuthenticatedRequest, @Param("address") address: string) {
        return this.watchlistService.remove(req.user.id, address);
    }

    // ── Wallet Alerts ─────────────────────────────────────────────────────────

    @Get(":address/alerts")
    async getAlerts(@Request() req: AuthenticatedRequest, @Param("address") address: string) {
        return this.walletAlertService.getAlertsForWallet(req.user.id, address);
    }

    @Post(":address/alerts")
    async createAlert(@Request() req: AuthenticatedRequest, @Param("address") address: string, @Body() dto: CreateWalletAlertDto) {
        return this.walletAlertService.create(req.user.id, address, dto);
    }

    @Patch(":address/alerts/:alertId")
    async updateAlert(@Request() req: AuthenticatedRequest, @Param("alertId") alertId: string, @Body() dto: UpdateWalletAlertDto) {
        return this.walletAlertService.update(req.user.id, alertId, dto);
    }

    @Delete(":address/alerts/:alertId")
    async deleteAlert(@Request() req: AuthenticatedRequest, @Param("alertId") alertId: string) {
        return this.walletAlertService.delete(req.user.id, alertId);
    }
}

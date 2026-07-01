import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { WatchlistService } from "./watchlist.service";
import { WalletAlertService } from "./wallet-alert.service";
import { AddWatchedWalletDto, UpdateWatchedWalletDto } from "./dtos/add-watched-wallet.dto";
import { CreateWalletAlertDto, UpdateWalletAlertDto } from "./dtos/wallet-alert.dto";
import { CurrentUser, CurrentUserPayload } from "../../common/decorators/current-user.decorator";

@Controller("watchlist")
@UseGuards(JwtAuthGuard)
export class WatchlistController {
    constructor(
        private readonly watchlistService: WatchlistService,
        private readonly walletAlertService: WalletAlertService
    ) {}

    // ── Watchlist CRUD ────────────────────────────────────────────────────────

    @Get()
    async getWatchlist(@CurrentUser() user: CurrentUserPayload) {
        return this.watchlistService.findByUserId(user.id);
    }

    @Post()
    async addWallet(@CurrentUser() user: CurrentUserPayload, @Body() dto: AddWatchedWalletDto) {
        return this.watchlistService.add(user.id, dto);
    }

    @Patch(":address")
    async updateWallet(@CurrentUser() user: CurrentUserPayload, @Param("address") address: string, @Body() dto: UpdateWatchedWalletDto) {
        return this.watchlistService.update(user.id, address, dto);
    }

    @Delete(":address")
    async removeWallet(@CurrentUser() user: CurrentUserPayload, @Param("address") address: string, @Query("network") network?: string) {
        return this.watchlistService.remove(user.id, address, network);
    }

    // ── Wallet Alerts ─────────────────────────────────────────────────────────

    @Get(":address/alerts")
    async getAlerts(@CurrentUser() user: CurrentUserPayload, @Param("address") address: string) {
        return this.walletAlertService.getAlertsForWallet(user.id, address);
    }

    @Post(":address/alerts")
    async createAlert(@CurrentUser() user: CurrentUserPayload, @Param("address") address: string, @Body() dto: CreateWalletAlertDto) {
        return this.walletAlertService.create(user.id, address, dto);
    }

    @Patch(":address/alerts/:alertId")
    async updateAlert(@CurrentUser() user: CurrentUserPayload, @Param("alertId") alertId: string, @Body() dto: UpdateWalletAlertDto) {
        return this.walletAlertService.update(user.id, alertId, dto);
    }

    @Delete(":address/alerts/:alertId")
    async deleteAlert(@CurrentUser() user: CurrentUserPayload, @Param("alertId") alertId: string) {
        return this.walletAlertService.delete(user.id, alertId);
    }
}

import { Controller, Get, Post, Delete, Param, Body, UseGuards, Query } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { AccountService } from "../services/account.service";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller("account/me")
export class AccountController {
    constructor(private readonly accountService: AccountService) {}

    // ⚠️ ĐẶT CÁC ROUTE CỤ THỂ Ở TRÊN TRƯỚC

    // Ping route để test API
    @Get("ping")
    ping() {
        return { message: "pong" };
    }

    // Lấy thống kê hoạt động của người dùng
    @UseGuards(JwtAuthGuard)
    @Get("stats")
    getStats(@CurrentUser() user: CurrentUserPayload) {
        return this.accountService.getUserStats(user.id);
    }

    // Lấy danh sách token yêu thích
    @UseGuards(JwtAuthGuard)
    @Get("favorites")
    getFavorites(@CurrentUser() user: CurrentUserPayload) {
        return this.accountService.getFavorites(user.id);
    }

    // Thêm token vào danh sách yêu thích
    @UseGuards(JwtAuthGuard)
    @Post("favorites")
    addFavorite(@CurrentUser() user: CurrentUserPayload, @Body() body: { token_address: string; network?: string }) {
        return this.accountService.addFavorite(user.id, body.token_address, body.network);
    }

    // Xóa token khỏi danh sách yêu thích
    @UseGuards(JwtAuthGuard)
    @Delete("favorites/:tokenAddress")
    removeFavorite(@CurrentUser() user: CurrentUserPayload, @Param("tokenAddress") tokenAddress: string, @Query("network") network?: string) {
        return this.accountService.removeFavorite(user.id, tokenAddress, network);
    }

    // Lấy danh sách ví của người dùng
    @UseGuards(JwtAuthGuard)
    @Get("wallets")
    getWallets(@CurrentUser() user: CurrentUserPayload) {
        return this.accountService.getWallets(user.id);
    }

    // ⚠️ ĐẶT ROUTE CHUNG Ở DƯỚI CÙNG

    // Lấy thông tin người dùng hiện tại
    @UseGuards(JwtAuthGuard)
    @Get()
    getProfile(@CurrentUser() user: CurrentUserPayload) {
        return this.accountService.getUserProfile(user.id);
    }
}

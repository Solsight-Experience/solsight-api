import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from "@nestjs/common";
import { AccountService } from "../services/account.service";
import { AddFavoriteDto } from "../dtos/favorite.dto";
import { RequestCluster } from "../../../common/cluster/request-cluster.decorator";
import type { Cluster } from "../../../common/cluster/cluster.types";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";
import { TokenFilterConditionDto } from "../../tokens/dtos/token.filter.dto";

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
    @Get("stats")
    getStats() {
        return this.accountService.getUserStats();
    }

    // Lấy danh sách token yêu thích
    @Get("favorites")
    @UseGuards(JwtAuthGuard)
    getFavorites(@CurrentUser() user: CurrentUserPayload, @RequestCluster() cluster: Cluster) {
        return this.accountService.getFavorites(user.id, cluster);
    }

    // Lọc danh sách token yêu thích (áp dụng bộ lọc như tokens/filter)
    @Post("favorites/filter")
    @UseGuards(JwtAuthGuard)
    filterFavorites(
        @CurrentUser() user: CurrentUserPayload,
        @RequestCluster() cluster: Cluster,
        @Query("sort_by") sort_by: string,
        @Query("sort_order") sort_order: "asc" | "desc",
        @Query("limit") limit: number = 10,
        @Query("offset") offset: number = 0,
        @Body() filterDto: TokenFilterConditionDto
    ) {
        return this.accountService.filterFavorites(user.id, cluster, filterDto, limit, sort_by, sort_order, offset);
    }

    // Thêm token vào danh sách yêu thích
    @Post("favorites")
    @UseGuards(JwtAuthGuard)
    addFavorite(@CurrentUser() user: CurrentUserPayload, @RequestCluster() cluster: Cluster, @Body() body: AddFavoriteDto) {
        return this.accountService.addFavorite(user.id, cluster, body.token_address);
    }

    // Xóa token khỏi danh sách yêu thích
    @Delete("favorites/:tokenAddress")
    @UseGuards(JwtAuthGuard)
    removeFavorite(@CurrentUser() user: CurrentUserPayload, @RequestCluster() cluster: Cluster, @Param("tokenAddress") tokenAddress: string) {
        return this.accountService.removeFavorite(user.id, cluster, tokenAddress);
    }

    // Lấy danh sách ví của người dùng
    @Get("wallets")
    getWallets() {
        return this.accountService.getWallets();
    }

    // ⚠️ ĐẶT ROUTE CHUNG Ở DƯỚI CÙNG

    // Lấy thông tin người dùng hiện tại
    @Get()
    getProfile() {
        return this.accountService.getUserProfile();
    }
}

import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { AccountService } from '../services/account.service';

@Controller('account/me')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  // ⚠️ ĐẶT CÁC ROUTE CỤ THỂ Ở TRÊN TRƯỚC

  // Ping route để test API
  @Get('ping')
  ping() {
    return { message: 'pong' };
  }

  // Lấy thống kê hoạt động của người dùng
  @Get('stats')
  getStats() {
    return this.accountService.getUserStats();
  }

  // Lấy danh sách token yêu thích
  @Get('favorites')
  getFavorites() {
    return this.accountService.getFavorites();
  }

  // Thêm token vào danh sách yêu thích
  @Post('favorites')
  addFavorite(@Body() body: { token_address: string }) {
    return this.accountService.addFavorite(body.token_address);
  }

  // Xóa token khỏi danh sách yêu thích
  @Delete('favorites/:tokenAddress')
  removeFavorite(@Param('tokenAddress') tokenAddress: string) {
    return this.accountService.removeFavorite(tokenAddress);
  }

  // Lấy danh sách ví của người dùng
  @Get('wallets')
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

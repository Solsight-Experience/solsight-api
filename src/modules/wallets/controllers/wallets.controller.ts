import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { WalletsService } from '../services/wallets.service';
import { CreateWalletDto } from '../dtos/create-wallet.dto';
import { Wallet } from '../entities/wallet.entity';

@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Post('user/:userId')
  async create(
    @Param('userId') userId: string,
    @Body() createWalletDto: CreateWalletDto,
  ): Promise<Wallet> {
    return await this.walletsService.create(userId, createWalletDto);
  }

  @Get('user/:userId')
  async findByUserId(@Param('userId') userId: string): Promise<Wallet[]> {
    return await this.walletsService.findByUserId(userId);
  }

  @Get(':id')
  async findById(@Param('id') id: string): Promise<Wallet> {
    return await this.walletsService.findById(id);
  }

  @Get('address/:address')
  async findByAddress(@Param('address') address: string): Promise<Wallet> {
    return await this.walletsService.findByAddress(address);
  }

  @Put(':id')
  async update(
    @Param('id') id: string,
    @Body() updateData: Partial<Wallet>,
  ): Promise<Wallet> {
    return await this.walletsService.update(id, updateData);
  }

  @Delete(':id')
  async delete(@Param('id') id: string): Promise<{ message: string }> {
    await this.walletsService.delete(id);
    return { message: 'Wallet deleted successfully' };
  }

  @Post(':id/update-balance')
  async updateBalance(@Param('id') id: string): Promise<Wallet> {
    return await this.walletsService.updateBalance(id);
  }

  @Get(':id/token-balance/:mintAddress')
  async getTokenBalance(
    @Param('id') id: string,
    @Param('mintAddress') mintAddress: string,
  ): Promise<{ balance: number }> {
    const balance = await this.walletsService.getTokenBalance(id, mintAddress);
    return { balance };
  }

  @Get(':id/transactions')
  async getTransactionHistory(
    @Param('id') id: string,
    @Query('limit') limit = 10,
  ) {
    return await this.walletsService.getTransactionHistory(id, Number(limit));
  }

  @Post(':id/verify')
  async verifyWallet(@Param('id') id: string): Promise<Wallet> {
    return await this.walletsService.verifyWallet(id);
  }

  @Post(':id/activate')
  async activateWallet(@Param('id') id: string): Promise<Wallet> {
    return await this.walletsService.activateWallet(id);
  }

  @Post(':id/deactivate')
  async deactivateWallet(@Param('id') id: string): Promise<Wallet> {
    return await this.walletsService.deactivateWallet(id);
  }
}

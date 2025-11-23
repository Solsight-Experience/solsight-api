import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { WalletsService } from '../services/wallets.service';
import { CreateWalletDto } from '../dtos/create-wallet.dto';
import { User } from '../../users/entities/user.entity';

interface AuthenticatedRequest extends Request {
  user: User;
}

@Controller({ path: 'users/me/wallets'})
export class UsersWalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Request() req: AuthenticatedRequest) {
    const userId = req.user.id;
    return await this.walletsService.listForUser(userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Request() req: AuthenticatedRequest, @Body() body: Partial<CreateWalletDto>) {
    const userId = req.user.id;
    const wallet = await this.walletsService.create(userId, body as CreateWalletDto);

    return {
      success: true,
      wallet: {
        address: wallet.address,
        name: wallet.name,
        icon: (wallet as any).icon || null,
        is_default: !!wallet.isDefault,
        added_at: wallet.createdAt,
      },
    };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':walletAddress')
  async update(
    @Request() req: AuthenticatedRequest,
    @Param('walletAddress') walletAddress: string,
    @Body() body: { name?: string; icon?: string },
  ) {
    const userId = req.user.id;
    const updated = await this.walletsService.updateByAddress(userId, walletAddress, body as any);
    return updated;
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':walletAddress')
  async remove(@Request() req: AuthenticatedRequest, @Param('walletAddress') walletAddress: string) {
    const userId = req.user.id;
    await this.walletsService.deleteByAddress(userId, walletAddress);
    return { message: 'Wallet deleted successfully' };
  }

  @UseGuards(JwtAuthGuard)
  @Patch(':walletAddress/set-default')
  async setDefault(@Request() req: AuthenticatedRequest, @Param('walletAddress') walletAddress: string) {
    const userId = req.user.id;
    const wallet = await this.walletsService.setDefaultForAddress(userId, walletAddress);
    return wallet;
  }
}

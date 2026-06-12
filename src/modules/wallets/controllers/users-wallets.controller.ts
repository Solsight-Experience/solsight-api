import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { WalletsService } from "../services/wallets.service";
import { CreateWalletDto } from "../dtos/create-wallet.dto";
import { WalletIcon } from "../entities/wallet.entity";
import { WalletsResponse, Wallet } from "../dtos/wallet.response.dto";
import { CurrentUser, CurrentUserPayload } from "../../../common/decorators/current-user.decorator";

@Controller({ path: "users/me/wallets" })
export class UsersWalletsController {
    constructor(private readonly walletsService: WalletsService) {}

    @UseGuards(JwtAuthGuard)
    @Get()
    async list(@CurrentUser() user: CurrentUserPayload): Promise<WalletsResponse> {
        return await this.walletsService.listForUser(user.id);
    }

    @UseGuards(JwtAuthGuard)
    @Get(":walletAddress")
    async getDetail(@CurrentUser() user: CurrentUserPayload, @Param("walletAddress") walletAddress: string): Promise<Wallet> {
        return await this.walletsService.getWalletByAddress(user.id, walletAddress);
    }

    @UseGuards(JwtAuthGuard)
    @Post()
    async create(@CurrentUser() user: CurrentUserPayload, @Body() body: Partial<CreateWalletDto>) {
        const wallet = await this.walletsService.create(user.id, body as CreateWalletDto);

        return {
            success: true,
            wallet: {
                address: wallet.address,
                name: wallet.name,
                icon: wallet.icon || null,
                is_default: !!wallet.isDefault,
                added_at: wallet.createdAt
            }
        };
    }

    @UseGuards(JwtAuthGuard)
    @Patch(":walletAddress")
    async update(@CurrentUser() user: CurrentUserPayload, @Param("walletAddress") walletAddress: string, @Body() body: { name?: string; icon?: WalletIcon }) {
        const updated = await this.walletsService.updateByAddress(user.id, walletAddress, body);
        return updated;
    }

    @UseGuards(JwtAuthGuard)
    @Delete()
    async removeAll(@CurrentUser() user: CurrentUserPayload) {
        await this.walletsService.deleteAllByUserId(user.id);
        return { message: "All wallets deleted successfully" };
    }

    @UseGuards(JwtAuthGuard)
    @Delete(":walletAddress")
    async remove(@CurrentUser() user: CurrentUserPayload, @Param("walletAddress") walletAddress: string) {
        await this.walletsService.deleteByAddress(user.id, walletAddress);
        return { message: "Wallet deleted successfully" };
    }

    @UseGuards(JwtAuthGuard)
    @Patch(":walletAddress/set-default")
    async setDefault(@CurrentUser() user: CurrentUserPayload, @Param("walletAddress") walletAddress: string) {
        const wallet = await this.walletsService.setDefaultForAddress(user.id, walletAddress);
        return wallet;
    }
}

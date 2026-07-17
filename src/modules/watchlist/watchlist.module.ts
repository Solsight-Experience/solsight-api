import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { WatchedWallet } from "./entities/watched-wallet.entity";
import { WalletAlert } from "./entities/wallet-alert.entity";
import { WatchlistController } from "./watchlist.controller";
import { WatchlistService } from "./watchlist.service";
import { WalletAlertService } from "./wallet-alert.service";
import { WalletAlertCheckerService } from "./wallet-alert-checker.service";
import { WalletTrackerHandler } from "./handlers/wallet-tracker.handler";
import { NotificationsModule } from "../notifications/notifications.module";
import { BotModule } from "../bot/bot.module";
import { TokensModule } from "../tokens/tokens.module";

@Module({
    imports: [TypeOrmModule.forFeature([WatchedWallet, WalletAlert]), NotificationsModule, BotModule, TokensModule],
    controllers: [WatchlistController],
    providers: [WatchlistService, WalletAlertService, WalletAlertCheckerService, WalletTrackerHandler]
})
export class WatchlistModule {}

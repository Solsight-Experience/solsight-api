import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WatchedWallet } from './entities/watched-wallet.entity';
import { WalletAlert } from './entities/wallet-alert.entity';
import { WatchlistController } from './watchlist.controller';
import { WatchlistService } from './watchlist.service';
import { WalletAlertService } from './wallet-alert.service';
import { WalletAlertCheckerService } from './wallet-alert-checker.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { SolanaModule } from '../../infra/solana/solana.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([WatchedWallet, WalletAlert]),
    NotificationsModule,
    SolanaModule,
  ],
  controllers: [WatchlistController],
  providers: [WatchlistService, WalletAlertService, WalletAlertCheckerService],
})
export class WatchlistModule {}

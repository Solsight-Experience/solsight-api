import { Module } from '@nestjs/common';
import { PortfolioController } from './controllers/portfolio.controller';
import { PortfolioService } from './services/portfolio.service';
import { WalletsModule } from '../wallets/wallets.module';
import { SolanaModule } from '../../infra/solana/solana.module';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Transaction } from '../transactions/entities/transaction.entity';
import { WalletSnapshot } from './entities/wallet-snapshot.entity';

@Module({
  imports: [WalletsModule, SolanaModule, CacheModule.register(), TypeOrmModule.forFeature([Transaction, WalletSnapshot])],
  controllers: [PortfolioController],
  providers: [PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}

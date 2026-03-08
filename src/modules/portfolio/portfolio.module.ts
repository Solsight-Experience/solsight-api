import { Module } from '@nestjs/common';
import { PortfolioController } from './controllers/portfolio.controller';
import { PortfolioService } from './services/portfolio.service';
import { WalletsModule } from '../wallets/wallets.module';
import { SolanaModule } from '../../infra/solana/solana.module';
import { CacheModule } from '@nestjs/cache-manager';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SwapTrade } from './entities/swap-trade.entity';

@Module({
  imports: [WalletsModule, SolanaModule, CacheModule.register(), TypeOrmModule.forFeature([SwapTrade])],
  controllers: [PortfolioController],
  providers: [PortfolioService],
})
export class PortfolioModule {}

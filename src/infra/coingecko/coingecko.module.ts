import { Module } from '@nestjs/common';
import { CoinGeckoService } from './coingecko.service';

@Module({
  providers: [CoinGeckoService],
  exports: [CoinGeckoService],
})
export class CoinGeckoModule {}

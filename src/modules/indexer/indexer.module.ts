import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketPriceEvent } from './entities/market-price-event.entity';
import { Transaction } from '../transactions/entities/transaction.entity';
import { Token } from '../tokens/entities/token.entity';
import { StreamConsumerService } from './services/stream-consumer.service';
import { RedisModule } from '../../redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([MarketPriceEvent, Transaction, Token]),
    RedisModule,
  ],
  providers: [StreamConsumerService],
})
export class IndexerModule {}

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { ZaloSubscription } from './entities/zalo-subscription.entity';
import { ZaloApiService } from './services/zalo-api.service';
import { ZaloSubscriptionService } from './services/zalo-subscription.service';
import { ZaloPollerService } from './services/zalo-poller.service';
import { ZaloController } from './controllers/zalo.controller';

@Module({
    imports: [TypeOrmModule.forFeature([ZaloSubscription]), ConfigModule],
    providers: [ZaloApiService, ZaloSubscriptionService, ZaloPollerService],
    controllers: [ZaloController],
    exports: [ZaloSubscriptionService],
})
export class ZaloModule {}

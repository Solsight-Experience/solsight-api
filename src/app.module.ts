import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './common/logger/logger.module';
import { SolanaModule } from './infra/solana/solana.module';
import { WebsocketModule } from './websocket/websocket.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { AuthModule } from './modules/auth/auth.module';
import { TokensModule } from './modules/tokens/tokens.module';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { CacheModule } from '@nestjs/cache-manager';
import { PortfolioModule } from './modules/portfolio/portfolio.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';
import { AccountModule } from './modules/account/account.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: true,
      },
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({
      isGlobal: true,
    }),
    WebsocketModule,
    DatabaseModule,
    LoggerModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    TransactionsModule,
    DiscoveryModule,
    TokensModule,
    AccountModule,
    PortfolioModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

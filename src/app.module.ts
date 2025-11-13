import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { LoggerModule } from './common/logger/logger.module';
import { SolanaModule } from './infra/solana/solana.module';
import { UsersModule } from './modules/users/users.module';
import { WalletsModule } from './modules/wallets/wallets.module';
import { AuthModule } from './modules/auth/auth.module';
import configuration from './config/configuration';
import { validationSchema } from './config/validation';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { DiscoveryModule } from './modules/discovery/discovery.module';

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
    DatabaseModule,
    LoggerModule,
    SolanaModule,
    AuthModule,
    UsersModule,
    WalletsModule,
    TransactionsModule,
    DiscoveryModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

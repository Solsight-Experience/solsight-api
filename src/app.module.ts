import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { ClusterModule } from "./common/cluster/cluster.module";
import { DatabaseModule } from "./database/database.module";
import { LoggerModule } from "./common/logger/logger.module";
import { WebsocketModule } from "./websocket/websocket.module";
import { UsersModule } from "./modules/users/users.module";
import { WalletsModule } from "./modules/wallets/wallets.module";
import { AuthModule } from "./modules/auth/auth.module";
import { TokensModule } from "./modules/tokens/tokens.module";
import configuration from "./config/configuration";
import { validationSchema } from "./config/validation";
import { CacheModule } from "@nestjs/cache-manager";
import { PortfolioModule } from "./modules/portfolio/portfolio.module";
import { TransactionsModule } from "./modules/transactions/transactions.module";
import { DiscoveryModule } from "./modules/discovery/discovery.module";
import { AccountModule } from "./modules/account/account.module";
import { LimitOrderModule } from "./modules/limit-order/limit-order.module";
import { RedisModule } from "./redis/redis.module";
import { ChatModule } from "./modules/chat/chat.module";
import { NotificationsModule } from "./modules/notifications/notifications.module";
import { IndexerModule } from "./modules/indexer/indexer.module";
import { WatchlistModule } from "./modules/watchlist/watchlist.module";
import { ZaloModule } from "./modules/zalo/zalo.module";
import { EmailModule } from "./modules/email/email.module";
import { SwapModule } from "./modules/swap/swap.module";
@Module({
    imports: [
        ConfigModule.forRoot({
            isGlobal: true,
            load: [configuration],
            validationSchema,
            validationOptions: {
                allowUnknown: true,
                abortEarly: true
            }
        }),
        ScheduleModule.forRoot(),
        CacheModule.register({
            isGlobal: true
        }),
        ClusterModule,
        WebsocketModule,
        RedisModule,
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
        LimitOrderModule,
        ChatModule,
        NotificationsModule,
        IndexerModule,
        WatchlistModule,
        ZaloModule,
        EmailModule,
        SwapModule
    ],
    controllers: [],
    providers: []
})
export class AppModule {}

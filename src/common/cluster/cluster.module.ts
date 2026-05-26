import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DataSourceRegistry } from "./data-source-registry";
import { ClusterProvider } from "./cluster.provider";
import { ClusterInterceptor } from "./cluster.interceptor";
import { ClusterEchoController } from "./cluster-echo.controller";
import { ClusterAwareSolanaConnection } from "./cluster-aware-solana-connection";
import { DATA_SOURCE_MAINNET, DATA_SOURCE_DEVNET } from "./cluster.types";
import { getPartitionedDatabaseConfig } from "../../config/database.config";

@Global()
@Module({
    imports: [
        ConfigModule,
        TypeOrmModule.forRootAsync({
            name: DATA_SOURCE_MAINNET,
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => getPartitionedDatabaseConfig(configService, "mainnet"),
            inject: [ConfigService]
        }),
        TypeOrmModule.forRootAsync({
            name: DATA_SOURCE_DEVNET,
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => getPartitionedDatabaseConfig(configService, "devnet"),
            inject: [ConfigService]
        })
    ],
    controllers: [ClusterEchoController],
    providers: [
        DataSourceRegistry,
        ClusterProvider,
        ClusterAwareSolanaConnection,
        {
            provide: APP_INTERCEPTOR,
            useClass: ClusterInterceptor
        }
    ],
    exports: [DataSourceRegistry, ClusterProvider, ClusterAwareSolanaConnection]
})
export class ClusterModule {}

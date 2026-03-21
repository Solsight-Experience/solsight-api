import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { getDatabaseConfig } from "../config/database.config";

@Module({
    imports: [
        TypeOrmModule.forRootAsync({
            imports: [ConfigModule],
            useFactory: getDatabaseConfig,
            inject: [ConfigService]
        })
    ],
    exports: [TypeOrmModule]
})
export class DatabaseModule {}

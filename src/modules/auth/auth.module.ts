import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AuthService } from "./services/auth.service";
import { AuthController } from "./controllers/auth.controller";
import { JwtStrategy } from "./strategies/jwt.strategy";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { UsersModule } from "../users/users.module";
import { WalletsModule } from "../wallets/wallets.module";
import { EmailModule } from "../email/email.module";
import { RedisModule } from "../../redis/redis.module";

import { User } from "../users/entities/user.entity";
import { UserRepository } from "./repositories/user.repository";

@Module({
    imports: [
        ConfigModule.forRoot(),
        WalletsModule,
        UsersModule,
        EmailModule,
        RedisModule,
        TypeOrmModule.forFeature([User]),

        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.getOrThrow<string>("jwt.secret"),
                signOptions: { expiresIn: configService.getOrThrow<string>("jwt.expiresIn") as `${number}${"s" | "m" | "h" | "d"}` }
            }),
            inject: [ConfigService]
        })
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy, JwtAuthGuard, UserRepository],
    exports: [AuthService, JwtAuthGuard, UserRepository]
})
export class AuthModule {}

import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { WebsocketGateway } from "./websocket.gateway";

@Module({
    imports: [
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.getOrThrow<string>("jwt.secret")
            }),
            inject: [ConfigService]
        })
    ],
    providers: [WebsocketGateway],
    exports: [WebsocketGateway]
})
export class WebsocketModule {}

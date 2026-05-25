import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { LoggerModule } from "src/common/logger/logger.module";
import { OpenAIModule } from "src/infra/openai/openai.module";
import { DiscoveryModule } from "../discovery/discovery.module";
import { PortfolioModule } from "../portfolio/portfolio.module";
import { TokensModule } from "../tokens/tokens.module";
import { ChatService } from "./services/chat.service";
import { WebsocketModule } from "src/websocket/websocket.module";
import { ChatGateway } from "./gateways/chat.gateway";
import { ChatController } from "./controllers/chat.controller";

@Module({
    imports: [
        ConfigModule,
        JwtModule.registerAsync({
            imports: [ConfigModule],
            useFactory: (configService: ConfigService) => ({
                secret: configService.getOrThrow<string>("jwt.secret")
            }),
            inject: [ConfigService]
        }),
        TokensModule,
        PortfolioModule,
        DiscoveryModule,
        LoggerModule,
        WebsocketModule,
        OpenAIModule
    ],
    providers: [ChatService, ChatGateway],
    controllers: [ChatController],
    exports: [ChatService]
})
export class ChatModule {}

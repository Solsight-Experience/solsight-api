import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { LoggerModule } from "src/common/logger/logger.module";
import { OpenAIModule } from "src/infra/openai/openai.module";
import { VectorStoreModule } from "src/infra/vectorstore/vectorstore.module";
import { DiscoveryModule } from "../discovery/discovery.module";
import { PortfolioModule } from "../portfolio/portfolio.module";
import { TokensModule } from "../tokens/tokens.module";
import { ChatService } from "./services/chat.service";
import { RagService } from "./services/rag.service";
import { WebsocketModule } from "src/websocket/websocket.module";
import { ChatGateway } from "./gateways/chat.gateway";
import { ChatController } from "./controllers/chat.controller";

import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatSession } from "./entities/chat-session.entity";
import { ChatMessage } from "./entities/chat-message.entity";
import { Wallet } from "../wallets/entities/wallet.entity";

@Module({
    imports: [
        TypeOrmModule.forFeature([ChatSession, ChatMessage, Wallet]),
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
        OpenAIModule,
        VectorStoreModule
    ],
    providers: [ChatService, RagService, ChatGateway],
    controllers: [ChatController],
    exports: [ChatService, RagService]
})
export class ChatModule {}

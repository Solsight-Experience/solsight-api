import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { ExecutorModule } from "../../infra/executor/executor.module";
import { LoggerModule } from "../../common/logger/logger.module";
import { OpenAIModule } from "../../infra/openai/openai.module";
import { VectorStoreModule } from "../../infra/vectorstore/vectorstore.module";
import { BillingModule } from "../billing/billing.module";
import { DiscoveryModule } from "../discovery/discovery.module";
import { PortfolioModule } from "../portfolio/portfolio.module";
import { PortfolioReportModule } from "../portfolio-report/portfolio-report.module";
import { TokensModule } from "../tokens/tokens.module";
import { ChatService } from "./services/chat.service";
import { RagService } from "./services/rag.service";
import { WebsocketModule } from "../../websocket/websocket.module";
import { ChatGateway } from "./gateways/chat.gateway";
import { ChatController } from "./controllers/chat.controller";

import { TypeOrmModule } from "@nestjs/typeorm";
import { ChatSession } from "./entities/chat-session.entity";
import { ChatMessage } from "./entities/chat-message.entity";
import { Wallet } from "../wallets/entities/wallet.entity";
import { RagDocument } from "./entities/rag-document.entity";

@Module({
    imports: [
        TypeOrmModule.forFeature([ChatSession, ChatMessage, Wallet, RagDocument]),
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
        PortfolioReportModule,
        DiscoveryModule,
        LoggerModule,
        WebsocketModule,
        OpenAIModule,
        VectorStoreModule,
        ExecutorModule,
        BillingModule
    ],
    providers: [ChatService, RagService, ChatGateway],
    controllers: [ChatController],
    exports: [ChatService, RagService]
})
export class ChatModule {}
